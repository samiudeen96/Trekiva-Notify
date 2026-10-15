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

/**
 * A date whose UTC clock reads the shop's local time. Excel dates carry no time zone, so a request made
 * at 10:30 in Kolkata has to be written as 10:30 for a person opening the file to see 10:30.
 */
export function shiftToZone(at: Date, timeZone: string): Date {
  return new Date(at.getTime() + offsetMs(at, timeZone));
}

function localDate(at: Date, timeZone: string): LocalDate {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(at)
    .split("-")
    .map(Number);
  return { y: y!, m: m!, d: d! };
}

export const DEFAULT_REPORT_HOUR = 10;
export const DEFAULT_REPORT_WEEKDAY = 2; // Tuesday (0 = Sunday)
export const DEFAULT_REPORT_MONTH_DAY = 1;

export interface ReportSchedule {
  frequency: Frequency;
  /** Hour of the day in the shop's time zone, 0-23. */
  hour: number;
  /** Weekly reports: 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** Monthly reports: 1-28 (never 29-31, so every month has the day). */
  monthDay: number;
}

function onSchedule(date: LocalDate, s: ReportSchedule): boolean {
  if (s.frequency === "DAILY") return true;
  if (s.frequency === "WEEKLY") return new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay() === s.weekday;
  return date.d === s.monthDay;
}

function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/**
 * Whether a report slot (the shop's chosen time, in its own time zone) fell after the last report and
 * has already passed. Asking again right after a report was sent is false, so a frequent cron cannot
 * send the same report twice.
 */
export function isReportDue(opts: ReportSchedule & { now: Date; lastReportAt: Date; timeZone: string }): boolean {
  const today = localDate(opts.now, opts.timeZone);
  // 40 days back covers a month between slots plus a long outage of the scheduler.
  for (let back = 0; back <= 40; back++) {
    const date = addDays(today, -back);
    if (!onSchedule(date, opts)) continue;
    const slot = zonedInstant(date, opts.hour, opts.timeZone);
    if (slot > opts.now) continue; // today's slot is still ahead
    return slot > opts.lastReportAt;
  }
  return false;
}

/** The next time a report is due after `now`, for showing "Next report: ..." in the settings. */
export function nextReportAt(opts: ReportSchedule & { now: Date; timeZone: string }): Date | null {
  const today = localDate(opts.now, opts.timeZone);
  for (let ahead = 0; ahead <= 62; ahead++) {
    const date = addDays(today, ahead);
    if (!onSchedule(date, opts)) continue;
    const slot = zonedInstant(date, opts.hour, opts.timeZone);
    if (slot > opts.now) return slot;
  }
  return null;
}
