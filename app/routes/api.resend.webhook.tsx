import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { getResend } from "../email/resend.server";
import { env } from "../utils/env.server";
import { logger } from "../utils/logger.server";

// Resend -> app: delivery results. Configure in Resend -> Webhooks with events
// email.delivered, email.bounced, email.complained (URL: <app>/api/resend/webhook).
export const action = async ({ request }: ActionFunctionArgs) => {
  const resend = getResend();
  if (!resend || !env.RESEND_WEBHOOK_SECRET) return new Response("not configured", { status: 503 });

  const payload = await request.text();
  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
    });
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  if (event.type !== "email.delivered" && event.type !== "email.bounced" && event.type !== "email.complained") {
    return new Response();
  }
  const status = event.type === "email.delivered" ? "DELIVERED" : event.type === "email.bounced" ? "BOUNCED" : "COMPLAINED";

  const resendId = event.data.email_id;
  const log = await db.notificationLog.findUnique({ where: { resendId } });
  if (!log) return new Response(); // not one of ours (or already redacted)

  await db.notificationLog.update({ where: { id: log.id }, data: { status } });
  if (status !== "DELIVERED") {
    // A bounce or a spam complaint: never email that address for this item again.
    await db.subscription.update({ where: { id: log.subscriptionId }, data: { status: "UNSUBSCRIBED" } });
    logger.info({ status }, "subscriber suppressed after delivery problem");
  }
  return new Response();
};
