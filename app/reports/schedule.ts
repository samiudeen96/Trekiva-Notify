export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY";

interface LocalDate {
  y: number;
  m: number; // 1-12
  d: number;
}

/** Milliseconds the zone is ahead of UTC at that instant (e.g. +19_800_000 for Asia/Kolkata). */
function offsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant a wall-clock time happens in the zone (DST-safe: the offset is looked up twice). */
export function zonedInstant({ y, m, d }: LocalDate, hour: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, hour);
  const first = guess - offsetMs(new Date(guess), timeZone);
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

function localDate(at: Date, timeZone: string): LocalDate {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(at)
    .split("-")
    .map(Number);
  return { y: y!, m: m!, d: d! };
}

const TUESDAY = 2;
const SLOT_HOUR: Record<Frequency, number> = { DAILY: 4, WEEKLY: 10, MONTHLY: 10 };

function onSchedule(date: LocalDate, frequency: Frequency): boolean {
  if (frequency === "DAILY") return true;
  const weekday = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
  if (weekday !== TUESDAY) return false;
  return frequency === "WEEKLY" || date.d <= 7; // monthly: the first Tuesday
}

/**
 * Whether a report slot (daily 4 AM, weekly Tuesday 10 AM, monthly first Tuesday 10 AM, in the
 * shop's time zone) fell after the last report and has already passed. Asking again right after a
 * report was sent is false, so a frequent cron cannot send the same report twice.
 */
export function isReportDue(opts: { frequency: Frequency; now: Date; lastReportAt: Date; timeZone: string }): boolean {
  const today = localDate(opts.now, opts.timeZone);
  const hour = SLOT_HOUR[opts.frequency];
  // 40 days back covers a month between slots plus a long outage of the scheduler.
  for (let back = 0; back <= 40; back++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d - back));
    const date = { y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate() };
    if (!onSchedule(date, opts.frequency)) continue;
    const slot = zonedInstant(date, hour, opts.timeZone);
    if (slot > opts.now) continue; // today's slot is still ahead
    return slot > opts.lastReportAt;
  }
  return false;
}
