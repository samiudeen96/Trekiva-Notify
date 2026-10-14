import { escapeHtml } from "../email/template";

export interface ReportRow {
  item: string;
  count: number;
}

export interface ReportInput {
  shopName: string;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  total: number;
  rows: ReportRow[]; // most requested first
  adminUrl: string;
}

const PERIOD = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly" } as const;

export function renderReportEmail(r: ReportInput): { subject: string; html: string; text: string } {
  const period = PERIOD[r.frequency];
  const noun = r.total === 1 ? "request" : "requests";
  const subject = `Notify me ${period} report: ${r.total} new ${noun}`;

  const body = r.rows
    .map(
      (row) =>
        `<tr><td style="padding:8px 0;border-top:1px solid #eee;">${escapeHtml(row.item)}</td>` +
        `<td style="padding:8px 0;border-top:1px solid #eee;text-align:right;font-weight:600;">${row.count}</td></tr>`,
    )
    .join("");
  const safeLink = /^https?:\/\//i.test(r.adminUrl) ? r.adminUrl : "#";

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:#f6f6f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;"><tr><td>
<div style="font-size:13px;color:#6d7175;">${escapeHtml(r.shopName)}</div>
<h1 style="font-size:20px;margin:8px 0 4px;">${r.total} new Notify me ${noun}</h1>
<div style="font-size:14px;color:#6d7175;margin-bottom:16px;">Your ${period} summary of back in stock requests.</div>
<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse;">
<tr><td style="padding-bottom:6px;color:#6d7175;">Product</td><td style="padding-bottom:6px;color:#6d7175;text-align:right;">Requests</td></tr>
${body}
</table>
<p style="margin:20px 0 0;"><a href="${escapeHtml(safeLink)}" style="color:#111;font-weight:600;">View all subscribers</a></p>
</td></tr></table></body></html>`;

  const text = [
    `${r.total} new Notify me ${noun} (${period} report)`,
    "",
    ...r.rows.map((row) => `${row.count} x ${row.item}`),
    "",
    `View all subscribers: ${r.adminUrl}`,
  ].join("\n");

  return { subject, html, text };
}
