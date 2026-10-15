import { describe, expect, it } from "vitest";
import { isReportDue, nextReportAt, shiftToZone, zonedInstant, type ReportSchedule } from "./schedule";

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const at = (iso: string) => new Date(iso);

const daily = (hour = 10): ReportSchedule => ({ frequency: "DAILY", hour, weekday: 2, monthDay: 1 });
const weekly = (weekday = 2, hour = 10): ReportSchedule => ({ frequency: "WEEKLY", hour, weekday, monthDay: 1 });
const monthly = (monthDay = 1, hour = 10): ReportSchedule => ({ frequency: "MONTHLY", hour, weekday: 2, monthDay });

describe("zonedInstant", () => {
  it("maps wall-clock time to UTC", () => {
    expect(zonedInstant({ y: 2026, m: 10, d: 14 }, 10, IST).toISOString()).toBe("2026-10-14T04:30:00.000Z");
  });
  it("handles daylight saving", () => {
    expect(zonedInstant({ y: 2026, m: 7, d: 1 }, 10, NY).toISOString()).toBe("2026-07-01T14:00:00.000Z"); // EDT
    expect(zonedInstant({ y: 2026, m: 1, d: 6 }, 10, NY).toISOString()).toBe("2026-01-06T15:00:00.000Z"); // EST
  });
});

describe("shiftToZone", () => {
  it("makes the UTC clock read local time", () => {
    expect(shiftToZone(at("2026-10-14T05:00:00Z"), IST).toISOString()).toBe("2026-10-14T10:30:00.000Z");
    expect(shiftToZone(at("2026-07-01T14:00:00Z"), NY).toISOString()).toBe("2026-07-01T10:00:00.000Z");
  });
});

describe("isReportDue", () => {
  it("daily at 10 AM: due after 10:00 local once, not before, not again after sending", () => {
    // Yesterday's report was already sent (13 Oct 10:30 IST), so only today's slot can make one due.
    const last = at("2026-10-13T05:00:00Z");
    // 10:00 IST = 04:30Z
    expect(isReportDue({ ...daily(), now: at("2026-10-14T05:00:00Z"), lastReportAt: last, timeZone: IST })).toBe(true);
    expect(isReportDue({ ...daily(), now: at("2026-10-14T04:00:00Z"), lastReportAt: last, timeZone: IST })).toBe(false); // 09:30 IST
    expect(isReportDue({ ...daily(), now: at("2026-10-14T06:00:00Z"), lastReportAt: at("2026-10-14T05:00:00Z"), timeZone: IST })).toBe(false);
  });

  it("honours a different time of day", () => {
    const last = at("2026-10-13T13:00:00Z"); // yesterday's 18:00 IST report went out
    // 18:00 IST = 12:30Z
    expect(isReportDue({ ...daily(18), now: at("2026-10-14T11:00:00Z"), lastReportAt: last, timeZone: IST })).toBe(false);
    expect(isReportDue({ ...daily(18), now: at("2026-10-14T13:00:00Z"), lastReportAt: last, timeZone: IST })).toBe(true);
  });

  it("weekly: only on the chosen weekday", () => {
    // 2026-10-13 is a Tuesday; 10:00 IST = 04:30Z
    const last = at("2026-10-06T06:00:00Z");
    expect(isReportDue({ ...weekly(2), now: at("2026-10-13T04:00:00Z"), lastReportAt: last, timeZone: IST })).toBe(false);
    expect(isReportDue({ ...weekly(2), now: at("2026-10-13T05:00:00Z"), lastReportAt: last, timeZone: IST })).toBe(true);
    expect(isReportDue({ ...weekly(2), now: at("2026-10-15T05:00:00Z"), lastReportAt: at("2026-10-13T05:00:00Z"), timeZone: IST })).toBe(false);
    // Friday choice: the Tuesday slot no longer counts
    expect(isReportDue({ ...weekly(5), now: at("2026-10-13T05:00:00Z"), lastReportAt: at("2026-10-12T00:00:00Z"), timeZone: IST })).toBe(false);
    expect(isReportDue({ ...weekly(5), now: at("2026-10-16T05:00:00Z"), lastReportAt: at("2026-10-12T00:00:00Z"), timeZone: IST })).toBe(true);
  });

  it("monthly: on the chosen day of the month", () => {
    const last = at("2026-09-01T00:00:00Z");
    expect(isReportDue({ ...monthly(15), now: at("2026-10-14T06:00:00Z"), lastReportAt: last, timeZone: IST })).toBe(true); // the 15th of Sep counted
    expect(isReportDue({ ...monthly(15), now: at("2026-10-15T06:00:00Z"), lastReportAt: at("2026-10-15T00:00:00Z"), timeZone: IST })).toBe(true);
    expect(isReportDue({ ...monthly(15), now: at("2026-10-20T06:00:00Z"), lastReportAt: at("2026-10-15T06:00:00Z"), timeZone: IST })).toBe(false);
  });

  it("catches up after a missed slot", () => {
    expect(isReportDue({ ...weekly(2), now: at("2026-10-16T00:00:00Z"), lastReportAt: at("2026-10-05T00:00:00Z"), timeZone: IST })).toBe(true);
  });
});

describe("nextReportAt", () => {
  it("daily: later today if the time is ahead, else tomorrow", () => {
    expect(nextReportAt({ ...daily(), now: at("2026-10-14T01:00:00Z"), timeZone: IST })?.toISOString()).toBe("2026-10-14T04:30:00.000Z");
    expect(nextReportAt({ ...daily(), now: at("2026-10-14T06:00:00Z"), timeZone: IST })?.toISOString()).toBe("2026-10-15T04:30:00.000Z");
  });

  it("weekly: the next chosen weekday", () => {
    // Wed 14 Oct 2026 -> next Tuesday is 20 Oct
    expect(nextReportAt({ ...weekly(2), now: at("2026-10-14T06:00:00Z"), timeZone: IST })?.toISOString()).toBe("2026-10-20T04:30:00.000Z");
    expect(nextReportAt({ ...weekly(5), now: at("2026-10-14T06:00:00Z"), timeZone: IST })?.toISOString()).toBe("2026-10-16T04:30:00.000Z");
  });

  it("monthly: the chosen day, rolling into next month", () => {
    expect(nextReportAt({ ...monthly(15), now: at("2026-10-14T06:00:00Z"), timeZone: IST })?.toISOString()).toBe("2026-10-15T04:30:00.000Z");
    expect(nextReportAt({ ...monthly(5), now: at("2026-10-14T06:00:00Z"), timeZone: IST })?.toISOString()).toBe("2026-11-05T04:30:00.000Z");
  });
});
