import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  // Jobs and logs cascade from their subscription.
  await db.$transaction([
    db.subscription.deleteMany({ where: { shopDomain: shop } }),
    db.settings.deleteMany({ where: { shopDomain: shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);
  logger.info({ shop, topic }, "shop data redacted");

  return new Response();
};
