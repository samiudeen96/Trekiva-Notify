import db from "../db.server";
import { getResend } from "../email/resend.server";
import { buildFrom } from "../email/sender";
import { unauthenticated } from "../shopify.server";
import { variantLabels } from "../shopify/labels.server";
import { env } from "../utils/env.server";
import { logger } from "../utils/logger.server";
import { isReportDue, type Frequency } from "./schedule";
import { renderReportEmail } from "./template";

const MAX_ROWS = 25;

const SHOP_QUERY = `#graphql
  query NotifyReportShop { shop { name ianaTimezone } }
`;

/** Emails each shop that asked for one its summary of new requests, when its schedule slot has passed. */
export async function runReports(now = new Date()): Promise<{ sent: number; skipped: number }> {
  const resend = getResend();
  if (!resend || !env.EMAIL_FROM) return { sent: 0, skipped: 0 };

  const shops = await db.settings.findMany({
    where: { reportFrequency: { not: null }, reportEmail: { not: null } },
  });

  let sent = 0;
  let skipped = 0;
  for (const s of shops) {
    const frequency = s.reportFrequency as Frequency;
    try {
      if (!s.lastReportAt) {
        // Settings saved before the clock existed: start it now rather than reporting all history.
        await db.settings.update({ where: { shopDomain: s.shopDomain }, data: { lastReportAt: now } });
        skipped++;
        continue;
      }

      const { admin } = await unauthenticated.admin(s.shopDomain);
      const res = await admin.graphql(SHOP_QUERY);
      const shop = ((await res.json()) as { data?: { shop: { name: string; ianaTimezone: string } } }).data?.shop;
      if (!shop) throw new Error("shop lookup failed");

      if (!isReportDue({ frequency, now, lastReportAt: s.lastReportAt, timeZone: shop.ianaTimezone })) {
        skipped++;
        continue;
      }

      const groups = await db.subscription.groupBy({
        by: ["variantId"],
        where: { shopDomain: s.shopDomain, createdAt: { gt: s.lastReportAt, lte: now } },
        _count: { _all: true },
        orderBy: { _count: { variantId: "desc" } },
      });
      const total = groups.reduce((n, g) => n + g._count._all, 0);

      if (total > 0) {
        const top = groups.slice(0, MAX_ROWS);
        const labels = await variantLabels(admin, top.map((g) => g.variantId));
        const mail = renderReportEmail({
          shopName: shop.name,
          frequency,
          total,
          rows: top.map((g) => ({ item: labels[g.variantId] ?? `Variant ${g.variantId.split("/").pop()}`, count: g._count._all })),
          adminUrl: `https://${s.shopDomain}/admin/apps`,
        });
        const { error } = await resend.emails.send({
          from: buildFrom(env.EMAIL_FROM, `${shop.name} Notify me`, s.senderEmail),
          to: [s.reportEmail!],
          cc: s.reportCc.length ? s.reportCc : undefined,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
        // Not advancing the clock on a failed send means the next run tries the same period again.
        if (error) throw new Error(error.message);
        sent++;
      } else {
        skipped++;
      }
      await db.settings.update({ where: { shopDomain: s.shopDomain }, data: { lastReportAt: now } });
    } catch (err) {
      logger.warn({ err, shop: s.shopDomain }, "report skipped");
      skipped++;
    }
  }
  logger.info({ sent, skipped }, "reports processed");
  return { sent, skipped };
}
