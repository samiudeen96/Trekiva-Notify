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
  /** The files attached to the email, so the email can point to them. */
  attachments?: { name: string; kind: "Excel" | "PDF" }[];
}

const PERIOD = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly" } as const;

export function renderReportEmail(r: ReportInput): { subject: string; html: string; text: string } {
  const period = PERIOD[r.frequency];
  const noun = r.total === 1 ? "request" : "requests";
  const subject = `Notify me ${period} report: ${r.total} new ${noun}`;

  const kinds = [...new Set((r.attachments ?? []).map((a) => a.kind))];
  const attachmentText =
    kinds.length === 0
      ? ""
      : kinds.length === 2
        ? "The full list is attached as an Excel file (filter and sort it) and a PDF (to read or print)."
        : kinds[0] === "Excel"
          ? "Every request is in the attached Excel file: filter and sort it however you like."
          : "The attached PDF has the summary and the latest requests, ready to read or print.";
  const attachmentHtml = attachmentText
    ? `<p style="margin:18px 0 0;font-size:13px;color:#6d7175;">${escapeHtml(attachmentText)}</p>`
    : "";

  const body = r.rows
    .map(
      (row) =>
        `<tr><td style="padding:8px 0;border-top:1px solid #eee;">${escapeHtml(row.item)}</td>` +
        `<td style="padding:8px 0;border-top:1px solid #eee;text-align:right;font-weight:600;">${row.count}</td></tr>`,
    )
    .join("");

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
${attachmentHtml}
</td></tr></table></body></html>`;

  const text = [
    `${r.total} new Notify me ${noun} (${period} report)`,
    "",
    ...r.rows.map((row) => `${row.count} x ${row.item}`),
    ...(attachmentText ? ["", attachmentText] : []),
  ].join("\n");

  return { subject, html, text };
}
