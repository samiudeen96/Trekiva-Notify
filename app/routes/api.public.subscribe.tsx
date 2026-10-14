import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { createVariantGateway } from "../shopify/variants.server";
import { SubscribeService } from "../subscriptions/subscribe.service";
import { subscriptionRepository } from "../subscriptions/subscription.repository";
import { allowSubscribeAttempt, clientIp } from "../utils/rate-limit.server";
import { logger } from "../utils/logger.server";

const bodySchema = z.object({
  productId: z.union([z.string(), z.number()]).transform(String),
  variantId: z.union([z.string(), z.number()]).transform(String),
  email: z.string().max(254),
  pageType: z.string().max(20).optional(),
  marketingOptIn: z.boolean().optional(),
  // Honeypot: real visitors never see this field, bots fill it in.
  tnTrap: z.string().optional(),
});

const json = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Reached through the Shopify app proxy: /apps/notify/subscribe
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  // Verifies Shopify's proxy signature; throws a 4xx Response if invalid.
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session || !admin) return json({ status: "error", message: "App not installed" }, 401);

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ status: "invalid_email" }, 400);

  // Pretend success to bots so they learn nothing, but store nothing.
  if (body.data.tnTrap) return json({ status: "subscribed" });

  const settings = await db.settings.findUnique({
    where: { shopDomain: session.shop },
    select: { enabled: true },
  });
  if (settings && !settings.enabled) return json({ status: "error", message: "Alerts are turned off." }, 403);

  if (!(await allowSubscribeAttempt(session.shop, clientIp(request), body.data.email.trim().toLowerCase()))) {
    return json({ status: "error", message: "Too many attempts. Please try again shortly." }, 429);
  }

  try {
    const outcome = await new SubscribeService(createVariantGateway(admin), subscriptionRepository).subscribe({
      shopDomain: session.shop,
      ...body.data,
    });
    return json(outcome, outcome.status === "invalid_email" || outcome.status === "invalid_variant" ? 400 : 200);
  } catch (err) {
    logger.error({ err, shop: session.shop }, "subscribe request failed");
    return json({ status: "error", message: "Something went wrong. Please try again." }, 500);
  }
};
