import { getResend } from "../email/resend.server";
import { buildFrom } from "../email/sender";
import { env } from "../utils/env.server";
import type { Frequency } from "./schedule";
import { renderReportEmail } from "./template";

/** Sends a report with made-up numbers so the merchant can see what the real one looks like. */
export async function sendSampleReport(opts: {
  to: string;
  cc: string[];
  shopName: string;
  frequency: Frequency;
  senderEmail?: string | null;
  adminUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend || !env.EMAIL_FROM) return { ok: false, error: "Resend is not configured (RESEND_API_KEY and EMAIL_FROM)." };

  const mail = renderReportEmail({
    shopName: opts.shopName,
    frequency: opts.frequency,
    total: 9,
    rows: [
      { item: "Men's Slip-On Sandals - Olive / 6", count: 4 },
      { item: "Men's Slip-On Sandals - Tan / 7", count: 3 },
      { item: "Trail Runner - Black / 9", count: 2 },
    ],
    adminUrl: opts.adminUrl,
  });
  const { error } = await resend.emails.send({
    from: buildFrom(env.EMAIL_FROM, `${opts.shopName} Notify me`, opts.senderEmail),
    to: [opts.to],
    cc: opts.cc.length ? opts.cc : undefined,
    subject: `[Sample] ${mail.subject}`,
    html: mail.html,
    text: mail.text,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
