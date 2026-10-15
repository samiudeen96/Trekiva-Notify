import { getResend } from "../email/resend.server";
import { buildFrom } from "../email/sender";
import { env } from "../utils/env.server";
import type { Frequency } from "./schedule";
import { renderReportEmail } from "./template";
import { buildPdf } from "./pdf.server";
import { formatsFor, kindOf } from "./format";
import { buildWorkbook, type RequestRow } from "./workbook.server";

/** Sends a report with made-up numbers so the merchant can see what the real one looks like. */
export async function sendSampleReport(opts: {
  to: string;
  cc: string[];
  shopName: string;
  frequency: Frequency;
  senderEmail?: string | null;
  /** EXCEL | PDF | BOTH: the same choice the real reports use. */
  format: string;
  timeZone: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend || !env.EMAIL_FROM) return { ok: false, error: "Resend is not configured (RESEND_API_KEY and EMAIL_FROM)." };

  const now = new Date();
  const statuses: RequestRow["status"][] = ["PENDING", "NOTIFIED", "PENDING", "UNSUBSCRIBED", "PENDING", "NOTIFIED"];
  const items = [
    { product: "Men's Slip-On Sandals", variant: "Olive / 6", sku: "TPG-3001-OLV-6" },
    { product: "Men's Slip-On Sandals", variant: "Tan / 7", sku: "TPG-3001-TAN-7" },
    { product: "Trail Runner", variant: "Black / 9", sku: "TRR-1002-BLK-9" },
  ];
  const rows: RequestRow[] = Array.from({ length: 9 }, (_, i) => ({
    email: `customer${i + 1}@example.com`,
    ...items[i % 3]!,
    status: statuses[i % 6]!,
    pageType: ["product", "collection", "search"][i % 3]!,
    marketing: i % 2 === 0,
    requestedAt: new Date(now.getTime() - i * 3 * 3_600_000),
    notifiedAt: statuses[i % 6] === "NOTIFIED" ? new Date(now.getTime() - i * 3_600_000) : null,
    revenue: statuses[i % 6] === "NOTIFIED" && i % 2 === 1 ? 720 : 0,
  }));
  const sheet = {
    shopName: opts.shopName,
    title: `Sample ${opts.frequency.toLowerCase()} report`,
    periodLabel: "Example numbers",
    timeZone: opts.timeZone,
    kpis: { newRequests: 9, pending: 24, notified: 17, unsubscribed: 3, failed: 0, revenue: 5040 },
    topTitle: "Most requested this period",
    top: [
      { item: "Men's Slip-On Sandals - Olive / 6", count: 4 },
      { item: "Men's Slip-On Sandals - Tan / 7", count: 3 },
      { item: "Trail Runner - Black / 9", count: 2 },
    ],
    rows,
    now,
  };
  const attachments: { filename: string; content: Buffer; kind: "Excel" | "PDF" }[] = [];
  for (const format of formatsFor(opts.format)) {
    const built = format === "xlsx" ? await buildWorkbook(sheet) : await buildPdf(sheet);
    attachments.push({ filename: `trekiva-notify-sample-report.${format}`, content: built.buffer, kind: kindOf(format) });
  }

  const mail = renderReportEmail({
    attachments: attachments.map((a) => ({ name: a.filename, kind: a.kind })),
    shopName: opts.shopName,
    frequency: opts.frequency,
    total: 9,
    rows: [
      { item: "Men's Slip-On Sandals - Olive / 6", count: 4 },
      { item: "Men's Slip-On Sandals - Tan / 7", count: 3 },
      { item: "Trail Runner - Black / 9", count: 2 },
    ],
  });
  const { error } = await resend.emails.send({
    from: buildFrom(env.EMAIL_FROM, `${opts.shopName} Notify me`, opts.senderEmail),
    to: [opts.to],
    cc: opts.cc.length ? opts.cc : undefined,
    subject: `[Sample] ${mail.subject}`,
    html: mail.html,
    text: mail.text,
    attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
