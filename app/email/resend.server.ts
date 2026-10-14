import { Resend } from "resend";
import { env } from "../utils/env.server";

let client: Resend | null = null;

/** The Resend client, or null while RESEND_API_KEY / EMAIL_FROM are not configured. */
export function getResend(): Resend | null {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return null;
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}
