import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { logger } from "../utils/logger.server";
import { processJobs } from "./jobs.server";
import { evaluateAndEnqueue } from "./restock.server";

const MAX_ITEMS_PER_RUN = 300;
const PAUSE_MS = 250; // keeps Admin API calls well inside the rate limit

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Safety net for missed webhooks: checks every item somebody is still waiting for against real
 * stock and queues the emails if it is back. Shopify can drop or delay webhooks, and an app that was
 * down during a restock would otherwise never notify anyone.
 */
export async function reconcile(): Promise<{ checked: number; queued: number; failedShops: number }> {
  const waiting = await db.subscription.groupBy({
    by: ["shopDomain", "inventoryItemId"],
    where: { status: "PENDING", inventoryItemId: { not: null } },
    orderBy: [{ shopDomain: "asc" }, { inventoryItemId: "asc" }],
    take: MAX_ITEMS_PER_RUN,
  });

  const byShop = new Map<string, string[]>();
  for (const w of waiting) {
    if (w.inventoryItemId) byShop.set(w.shopDomain, [...(byShop.get(w.shopDomain) ?? []), w.inventoryItemId]);
  }

  let checked = 0;
  let queued = 0;
  let failedShops = 0;
  for (const [shop, items] of byShop) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      for (const inventoryItemGid of items) {
        queued += await evaluateAndEnqueue({ shop, inventoryItemGid, eventLocationId: null, admin });
        checked++;
        await sleep(PAUSE_MS);
      }
    } catch (err) {
      // Uninstalled shop or Shopify down: the next run tries again.
      failedShops++;
      logger.warn({ err, shop }, "reconcile skipped a shop");
    }
  }

  if (queued > 0) await processJobs();
  logger.info({ checked, queued, failedShops }, "reconcile finished");
  return { checked, queued, failedShops };
}
