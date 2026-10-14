import { getResend } from "./resend.server";
import { buildFrom } from "./sender";
import { SAMPLE } from "./sample";
import { renderRestockEmail } from "./template";
import { env } from "../utils/env.server";

/** Sends the real template with sample data so the merchant can check sender, subject and layout. */
export async function sendTestEmail(opts: {
  to: string;
  shopName: string;
  emailConfig: unknown;
  senderEmail?: string | null;
  replyTo?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend || !env.EMAIL_FROM) return { ok: false, error: "Resend is not configured (RESEND_API_KEY and EMAIL_FROM)." };

  const mail = renderRestockEmail(opts.emailConfig, { ...SAMPLE, shopName: opts.shopName });
  const { error } = await resend.emails.send({
    from: buildFrom(env.EMAIL_FROM, mail.fromName, opts.senderEmail),
    to: [opts.to],
    subject: `[Test] ${mail.subject}`,
    html: mail.html,
    text: mail.text,
    replyTo: opts.replyTo || env.EMAIL_REPLY_TO || undefined,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
