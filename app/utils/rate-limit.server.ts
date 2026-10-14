import { RateLimiterMemory } from "rate-limiter-flexible";
import { env } from "./env.server";

// In-memory: correct for a single-instance deployment. Swap for a Redis/Postgres limiter if the
// app is ever scaled horizontally.
const subscribeLimiter = new RateLimiterMemory({
  points: env.SUBSCRIBE_RATE_LIMIT_PER_MIN,
  duration: 60,
});

// Per-shop ceiling across all visitors: bounds abuse even if the forwarded client IP can be varied.
const shopLimiter = new RateLimiterMemory({
  points: env.SUBSCRIBE_RATE_LIMIT_PER_MIN * 30,
  duration: 60,
});

// Per-email ceiling: stops one address being used to spam a victim's inbox with confirmations.
const emailLimiter = new RateLimiterMemory({ points: 3, duration: 60 * 10 });

async function consume(limiter: RateLimiterMemory, key: string): Promise<boolean> {
  try {
    await limiter.consume(key);
    return true;
  } catch {
    return false;
  }
}

export async function allowSubscribeAttempt(shop: string, ip: string, email: string): Promise<boolean> {
  if (!(await consume(shopLimiter, shop))) return false;
  if (!(await consume(subscribeLimiter, `${shop}:${ip}`))) return false;
  return consume(emailLimiter, `${shop}:${email}`);
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
