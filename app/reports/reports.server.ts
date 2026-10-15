import db from "../db.server";
import { getResend } from "../email/resend.server";
import { buildFrom } from "../email/sender";
import { unauthenticated } from "../shopify.server";
import { variantLabels } from "../shopify/labels.server";
import { env } from "../utils/env.server";
import { logger } from "../utils/logger.server";
import { isReportDue, type Frequency } from "./schedule";
import { exportFiles } from "./export.server";
import { formatsFor, kindOf } from "./format";
import { renderReportEmail } from "./template";

const MAX_ROWS = 25;

const frequencyLabel = (f: Frequency) => ({ DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" })[f];
const dayLabel = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone }).format(d);
/** 2026-10-20 in the shop's time zone, for file names. */
const dateStamp = (d: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);

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

      if (!isReportDue({ frequency, hour: s.reportHour, weekday: s.reportWeekday, monthDay: s.reportMonthDay, now, lastReportAt: s.lastReportAt, timeZone: shop.ianaTimezone })) {
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
        // Every request of the period goes into an Excel file: the email only has room for the top few.
        const period = `${dayLabel(s.lastReportAt, shop.ianaTimezone)} - ${dayLabel(now, shop.ianaTimezone)}`;
        const fileBase = `trekiva-notify-${frequency.toLowerCase()}-report-${dateStamp(now, shop.ianaTimezone)}`;
        const exported = await exportFiles({
          shopDomain: s.shopDomain,
          admin,
          formats: formatsFor(s.reportFormat),
          fileBase,
          title: `${frequencyLabel(frequency)} report`,
          periodLabel: period,
          topTitle: "Most requested this period",
          where: { shopDomain: s.shopDomain, createdAt: { gt: s.lastReportAt, lte: now } },
          shop: { name: shop.name, timeZone: shop.ianaTimezone },
          now,
        });
        const mail = renderReportEmail({
          attachments: exported.files.map((f) => ({ name: f.filename, kind: kindOf(f.format) })),
          shopName: shop.name,
          frequency,
          total,
          rows: top.map((g) => ({ item: labels[g.variantId] ?? `Variant ${g.variantId.split("/").pop()}`, count: g._count._all })),
        });
        const { error } = await resend.emails.send({
          from: buildFrom(env.EMAIL_FROM, `${shop.name} Notify me`, s.senderEmail),
          to: [s.reportEmail!],
          cc: s.reportCc.length ? s.reportCc : undefined,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          attachments: exported.files.map((f) => ({ filename: f.filename, content: f.content })),
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
