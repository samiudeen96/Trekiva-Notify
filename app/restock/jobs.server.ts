import db from "../db.server";
import { getResend } from "../email/resend.server";
import { buildFrom } from "../email/sender";
import { renderRestockEmail } from "../email/template";
import { unauthenticated } from "../shopify.server";
import { env } from "../utils/env.server";
import { logger } from "../utils/logger.server";
import { MAX_ATTEMPTS, retryDelayMinutes } from "./decision";

interface AdminGraphqlClient {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
}

const BATCH_SIZE = 100; // Resend's batch limit
const BATCH_PAUSE_MS = 600; // stays under Resend's default 2 requests/second
const STUCK_AFTER_MS = 10 * 60 * 1000;

export const SHOP_QUERY = `#graphql
  query NotifyShop {
    shop { name currencyCode primaryDomain { url } }
  }
`;

export const VARIANT_DETAILS_QUERY = `#graphql
  query NotifyVariantDetails($id: ID!) {
    productVariant(id: $id) {
      id
      title
      price
      compareAtPrice
      selectedOptions { name value }
      image { url }
      product { title handle featuredMedia { preview { image { url } } } }
    }
  }
`;

export const BRAND_QUERY = `#graphql
  query NotifyBrand {
    shop { brand { logo { image { url } } } }
  }
`;

interface ShopInfo {
  name: string;
  currencyCode: string;
  storeUrl: string;
  logoUrl: string | null;
}

interface VariantDetails {
  title: string;
  productTitle: string;
  handle: string;
  imageUrl: string | null;
  price: string | null;
  compareAtPrice: string | null;
  options: { name: string; value: string }[];
}

async function gql<T>(admin: AdminGraphqlClient, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await admin.graphql(query, variables ? { variables } : undefined);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors || !json.data) throw new Error("shopify query failed");
  return json.data;
}

async function loadShop(admin: AdminGraphqlClient, shopDomain: string): Promise<ShopInfo> {
  const d = await gql<{ shop: { name: string; currencyCode: string; primaryDomain: { url: string } | null } }>(admin, SHOP_QUERY);
  // Branding is optional: a store without a logo, or a lookup failure, just sends the name instead.
  let logoUrl: string | null = null;
  try {
    const b = await gql<{ shop: { brand: { logo: { image: { url: string } | null } | null } | null } }>(admin, BRAND_QUERY);
    logoUrl = b.shop.brand?.logo?.image?.url ?? null;
  } catch {
    logoUrl = null;
  }
  return {
    logoUrl,
    name: d.shop.name,
    currencyCode: d.shop.currencyCode,
    // Customers shop on the primary domain; the myshopify address is the fallback.
    storeUrl: (d.shop.primaryDomain?.url ?? `https://${shopDomain}`).replace(/\/$/, ""),
  };
}

async function loadVariant(admin: AdminGraphqlClient, variantGid: string, shop: ShopInfo): Promise<VariantDetails | null> {
  const d = await gql<{
    productVariant: {
      title: string;
      price: string;
      compareAtPrice: string | null;
      selectedOptions: { name: string; value: string }[];
      image: { url: string } | null;
      product: { title: string; handle: string; featuredMedia: { preview: { image: { url: string } | null } | null } | null };
    } | null;
  }>(admin, VARIANT_DETAILS_QUERY, { id: variantGid });
  const v = d.productVariant;
  if (!v) return null;
  const money = (amount: string | null): string | null => {
    if (!amount) return null;
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency: shop.currencyCode }).format(Number(amount));
    } catch {
      return null;
    }
  };
  const price = money(v.price);
  const compareAt = Number(v.compareAtPrice) > Number(v.price) ? money(v.compareAtPrice) : null;
  return {
    title: v.title,
    productTitle: v.product.title,
    handle: v.product.handle,
    imageUrl: v.image?.url ?? v.product.featuredMedia?.preview?.image?.url ?? null,
    price,
    compareAtPrice: compareAt,
    options: v.selectedOptions,
  };
}

const numericId = (gid: string) => gid.split("/").pop() ?? gid;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chunk = <T>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/** A job whose send failed: retried with backoff, or given up on after MAX_ATTEMPTS. */
async function failJob(jobId: string, subscriptionId: string, attempts: number, message: string): Promise<void> {
  if (attempts >= MAX_ATTEMPTS) {
    await db.$transaction([
      db.notificationJob.update({ where: { id: jobId }, data: { status: "FAILED", lastError: message } }),
      db.subscription.update({ where: { id: subscriptionId }, data: { status: "FAILED" } }),
      db.notificationLog.create({ data: { subscriptionId, status: "FAILED", error: message.slice(0, 500) } }),
    ]);
    return;
  }
  await db.notificationJob.update({
    where: { id: jobId },
    data: {
      status: "QUEUED",
      lastError: message,
      runAfter: new Date(Date.now() + retryDelayMinutes(attempts) * 60_000),
    },
  });
}

/** Sends due restock emails. Safe to call concurrently: each job is claimed by one caller. */
export async function processJobs(limit = 200): Promise<{ sent: number; failed: number }> {
  const resend = getResend();
  if (!resend || !env.EMAIL_FROM) {
    logger.warn("Resend is not configured: restock emails stay queued");
    return { sent: 0, failed: 0 };
  }

  // A worker that died mid-send leaves PROCESSING rows behind; hand them back to the queue.
  await db.notificationJob.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
    data: { status: "QUEUED" },
  });

  const due = await db.notificationJob.findMany({
    where: { status: "QUEUED", runAfter: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  if (due.length === 0) return { sent: 0, failed: 0 };

  const claimed = await db.notificationJob.updateManyAndReturn({
    where: { id: { in: due.map((j) => j.id) }, status: "QUEUED" },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });
  const subs = await db.subscription.findMany({
    where: { id: { in: claimed.map((j) => j.subscriptionId) } },
  });
  const subById = new Map(subs.map((s) => [s.id, s]));

  let sent = 0;
  let failed = 0;
  const byShop = new Map<string, typeof claimed>();
  for (const job of claimed) byShop.set(job.shopDomain, [...(byShop.get(job.shopDomain) ?? []), job]);

  for (const [shopDomain, jobs] of byShop) {
    let admin: AdminGraphqlClient;
    let shop: ShopInfo;
    try {
      admin = (await unauthenticated.admin(shopDomain)).admin;
      shop = await loadShop(admin, shopDomain);
    } catch (err) {
      // No session (uninstalled) or Shopify unavailable: retry, and give up after MAX_ATTEMPTS.
      for (const job of jobs) await failJob(job.id, job.subscriptionId, job.attempts, `shop unavailable: ${String(err)}`);
      failed += jobs.length;
      continue;
    }

    const settings = await db.settings.findUnique({ where: { shopDomain } });
    const variants = new Map<string, VariantDetails | null>();
    const ready: { jobId: string; subscriptionId: string; attempts: number; payload: Record<string, unknown> }[] = [];

    for (const job of jobs) {
      const sub = subById.get(job.subscriptionId);
      if (!sub || sub.status !== "NOTIFIED") {
        // Unsubscribed (or deleted) while waiting in the queue: nothing to send.
        await db.notificationJob.update({ where: { id: job.id }, data: { status: "FAILED", lastError: "skipped: no longer subscribed" } });
        continue;
      }
      try {
        if (!variants.has(sub.variantId)) variants.set(sub.variantId, await loadVariant(admin, sub.variantId, shop));
        const variant = variants.get(sub.variantId);
        if (!variant) {
          await db.$transaction([
            db.notificationJob.update({ where: { id: job.id }, data: { status: "FAILED", lastError: "variant no longer exists" } }),
            db.subscription.update({ where: { id: sub.id }, data: { status: "FAILED" } }),
          ]);
          failed++;
          continue;
        }

        const appUrl = env.SHOPIFY_APP_URL.replace(/\/$/, "");
        const unsubscribeUrl = `${appUrl}/unsubscribe?token=${encodeURIComponent(sub.unsubToken)}`;
        const productUrl =
          `${shop.storeUrl}/products/${encodeURIComponent(variant.handle)}` +
          `?variant=${numericId(sub.variantId)}&utm_source=trekiva_notify&utm_medium=email&notify=${encodeURIComponent(sub.id)}`;
        const mail = renderRestockEmail(settings?.emailConfig, {
          shopName: shop.name,
          productName: variant.productTitle,
          variantTitle: variant.title,
          options: variant.options,
          imageUrl: variant.imageUrl,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          shopLogoUrl: shop.logoUrl,
          storeUrl: shop.storeUrl,
          productUrl,
          unsubscribeUrl,
        });
        ready.push({
          jobId: job.id,
          subscriptionId: sub.id,
          attempts: job.attempts,
          payload: {
            from: buildFrom(env.EMAIL_FROM, mail.fromName, settings?.senderEmail),
            to: [sub.email],
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            replyTo: settings?.replyTo || env.EMAIL_REPLY_TO || undefined,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          },
        });
      } catch (err) {
        await failJob(job.id, job.subscriptionId, job.attempts, String(err));
        failed++;
      }
    }

    for (const [i, batch] of chunk(ready, BATCH_SIZE).entries()) {
      if (i > 0) await sleep(BATCH_PAUSE_MS);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await resend.batch.send(batch.map((b) => b.payload) as any);
      if (error || !data) {
        for (const b of batch) await failJob(b.jobId, b.subscriptionId, b.attempts, error?.message ?? "resend batch failed");
        failed += batch.length;
        continue;
      }
      for (const [n, b] of batch.entries()) {
        await db.$transaction([
          db.notificationJob.update({ where: { id: b.jobId }, data: { status: "SENT", lastError: null } }),
          db.notificationLog.create({ data: { subscriptionId: b.subscriptionId, resendId: data.data[n]?.id, status: "SENT" } }),
        ]);
      }
      sent += batch.length;
    }
  }

  logger.info({ sent, failed }, "restock jobs processed");
  return { sent, failed };
}
