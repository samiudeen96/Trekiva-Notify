import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  logger.info({ shop, topic }, "webhook received");

  // Webhooks can be redelivered after the session is already gone.
  // Subscriptions and settings are kept until shop/redact (48h later) per Shopify policy,
  // but no more restock emails go out: pending jobs are parked as FAILED.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }
  await db.notificationJob.updateMany({
    where: { shopDomain: shop, status: { in: ["QUEUED", "PROCESSING"] } },
    data: { status: "FAILED", lastError: "app uninstalled" },
  });

  return new Response();
};
