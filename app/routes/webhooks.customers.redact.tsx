import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { normalizeEmail } from "../subscriptions/email";
import { logger } from "../utils/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  const email =
    typeof payload?.customer?.email === "string" ? normalizeEmail(payload.customer.email) : null;

  if (email) {
    const { count } = await db.subscription.deleteMany({
      where: { shopDomain: shop, emailNormalized: email },
    });
    logger.info({ shop, topic, deleted: count }, "customer subscriptions redacted");
  }

  return new Response();
};
