import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { extractNotifyId, revenueForVariant, withinWindow } from "../attribution/attribution";
import { logger } from "../utils/logger.server";

// "Revenue converted": a paid order that came from a restock email, for the variant it announced.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  const notifyId = extractNotifyId(payload ?? {});
  if (!notifyId) return new Response();

  const sub = await db.subscription.findFirst({
    where: { id: notifyId, shopDomain: shop, status: "NOTIFIED" },
    select: { id: true, variantId: true, notifiedAt: true },
  });
  if (!sub) return new Response();

  const orderAt = new Date(payload.created_at ?? Date.now());
  if (!withinWindow(sub.notifiedAt, orderAt)) return new Response();

  const revenue = revenueForVariant(payload.line_items ?? [], sub.variantId.split("/").pop() ?? "");
  if (revenue > 0) {
    // Set, not add: Shopify redelivers webhooks, and adding would count one order twice.
    await db.subscription.update({ where: { id: sub.id }, data: { revenue } });
    logger.info({ shop, topic, revenue }, "restock conversion recorded");
  }
  return new Response();
};
