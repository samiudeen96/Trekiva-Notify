import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { logger } from "../utils/logger.server";

// Data held per customer: subscription rows (email, product/variant, status, timestamps).
// The merchant can export these from the Subscribers page; the request is logged for audit.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  logger.info({ shop, topic, customerId: payload?.customer?.id }, "customer data request received");
  return new Response();
};
