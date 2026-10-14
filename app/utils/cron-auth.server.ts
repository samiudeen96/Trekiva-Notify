import { timingSafeEqual } from "node:crypto";
import { env } from "./env.server";

/** null = authorised, otherwise the response to send. Scheduler sends `Authorization: Bearer <CRON_SECRET>`. */
export function checkCron(request: Request): Response | null {
  if (!env.CRON_SECRET) return new Response("CRON_SECRET is not configured", { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
