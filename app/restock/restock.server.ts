import db from "../db.server";
import { logger } from "../utils/logger.server";
import { shouldNotify, type LevelQuantity } from "./decision";
import { enqueueRestock } from "./queue.server";
import { processJobs } from "./jobs.server";

interface AdminGraphqlClient {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
}

export const INVENTORY_QUERY = `#graphql
  query NotifyInventory($id: ID!) {
    inventoryItem(id: $id) {
      id
      inventoryLevels(first: 50) {
        nodes {
          location { id }
          quantities(names: ["available"]) { name quantity }
        }
      }
    }
  }
`;

interface InventoryResponse {
  data?: {
    inventoryItem: {
      inventoryLevels: {
        nodes: { location: { id: string }; quantities: { name: string; quantity: number }[] }[];
      };
    } | null;
  };
  errors?: unknown;
}

export async function fetchLevels(admin: AdminGraphqlClient, inventoryItemGid: string): Promise<LevelQuantity[] | null> {
  const res = await admin.graphql(INVENTORY_QUERY, { variables: { id: inventoryItemGid } });
  const json = (await res.json()) as InventoryResponse;
  if (json.errors || !json.data) throw new Error("inventory lookup failed");
  if (!json.data.inventoryItem) return null;
  return json.data.inventoryItem.inventoryLevels.nodes.map((n) => ({
    locationId: n.location.id,
    available: n.quantities.find((q) => q.name === "available")?.quantity ?? 0,
  }));
}

/**
 * Decides whether the item is restocked enough to notify, and queues the emails if so.
 * `eventLocationId` is the location a webhook fired for, or null when checking the item as a whole.
 */
export async function evaluateAndEnqueue(opts: {
  shop: string;
  inventoryItemGid: string;
  eventLocationId: string | null;
  admin: AdminGraphqlClient;
}): Promise<number> {
  const settings = await db.settings.findUnique({ where: { shopDomain: opts.shop } });
  if (settings && !settings.enabled) return 0;

  const levels = await fetchLevels(opts.admin, opts.inventoryItemGid);
  if (!levels) return 0;

  const notify = shouldNotify({
    eventLocationId: opts.eventLocationId,
    enabledLocationIds: settings?.enabledLocationIds ?? [],
    levels,
    threshold: settings?.minStockThreshold ?? 1,
  });
  if (!notify) return 0;

  const queued = await enqueueRestock(opts.shop, opts.inventoryItemGid);
  logger.info({ shop: opts.shop, inventoryItemGid: opts.inventoryItemGid, queued }, "restock emails queued");
  return queued;
}

/** Sends now instead of waiting for the next cron tick; the caller's response does not wait for it. */
export function sendSoon(): void {
  setImmediate(() => {
    processJobs().catch((err) => logger.error({ err }, "job processing failed"));
  });
}

/** Entry point of the inventory_levels/update webhook. Returns how many emails were queued. */
export async function handleInventoryChange(opts: {
  shop: string;
  inventoryItemId: number | string;
  locationId: number | string | null;
  admin: AdminGraphqlClient;
}): Promise<number> {
  const inventoryItemGid = `gid://shopify/InventoryItem/${opts.inventoryItemId}`;

  // Cheap path first: most stock changes involve variants nobody is waiting for.
  const waiting = await db.subscription.count({
    where: { shopDomain: opts.shop, inventoryItemId: inventoryItemGid, status: "PENDING" },
  });
  if (waiting === 0) return 0;

  const queued = await evaluateAndEnqueue({
    shop: opts.shop,
    inventoryItemGid,
    eventLocationId: opts.locationId ? `gid://shopify/Location/${opts.locationId}` : null,
    admin: opts.admin,
  });
  if (queued > 0) sendSoon();
  return queued;
}
