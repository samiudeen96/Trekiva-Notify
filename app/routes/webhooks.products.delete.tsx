import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";

// A deleted product can never come back in stock: drop the requests still waiting for it.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  if (payload?.id) {
    const { count } = await db.subscription.deleteMany({
      where: { shopDomain: shop, productId: `gid://shopify/Product/${payload.id}`, status: "PENDING" },
    });
    logger.info({ shop, topic, deleted: count }, "pending subscriptions of deleted product removed");
  }
  return new Response();
};
