import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleInventoryChange } from "../restock/restock.server";
import { logger } from "../utils/logger.server";

// inventory_levels/update: { inventory_item_id, location_id, available, ... }
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  // The session is gone after uninstall; redelivered webhooks then have nothing to do.
  if (!admin) return new Response();

  // Stock going down (or to zero) can never be a restock.
  if (typeof payload?.available !== "number" || payload.available <= 0 || !payload.inventory_item_id) {
    return new Response();
  }

  try {
    await handleInventoryChange({
      shop,
      inventoryItemId: payload.inventory_item_id,
      locationId: payload.location_id ?? null,
      admin,
    });
  } catch (err) {
    // A 5xx makes Shopify redeliver, which is what we want if Shopify or the database blipped.
    logger.error({ err, shop, topic }, "inventory webhook failed");
    return new Response("error", { status: 500 });
  }
  return new Response();
};
