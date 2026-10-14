import { describe, expect, it } from "vitest";
import { isReportDue, zonedInstant } from "./schedule";

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const at = (iso: string) => new Date(iso);

describe("zonedInstant", () => {
  it("maps wall-clock time to UTC", () => {
    expect(zonedInstant({ y: 2026, m: 10, d: 14 }, 4, IST).toISOString()).toBe("2026-10-13T22:30:00.000Z");
  });
  it("handles daylight saving", () => {
    expect(zonedInstant({ y: 2026, m: 7, d: 1 }, 10, NY).toISOString()).toBe("2026-07-01T14:00:00.000Z"); // EDT
    expect(zonedInstant({ y: 2026, m: 1, d: 6 }, 10, NY).toISOString()).toBe("2026-01-06T15:00:00.000Z"); // EST
  });
});

describe("isReportDue", () => {
  it("daily: due after 4 AM local once, not again after sending", () => {
    const last = at("2026-10-13T00:00:00Z");
    expect(isReportDue({ frequency: "DAILY", now: at("2026-10-14T00:00:00Z"), lastReportAt: last, timeZone: IST })).toBe(true); // 05:30 IST
    expect(isReportDue({ frequency: "DAILY", now: at("2026-10-13T20:00:00Z"), lastReportAt: last, timeZone: IST })).toBe(false); // 01:30 IST, slot ahead
    expect(isReportDue({ frequency: "DAILY", now: at("2026-10-14T01:00:00Z"), lastReportAt: at("2026-10-14T00:00:00Z"), timeZone: IST })).toBe(false);
  });

  it("weekly: only on Tuesday 10 AM or later", () => {
    // 2026-10-13 is a Tuesday; 10:00 IST = 04:30Z
    const last = at("2026-10-06T06:00:00Z");
    expect(isReportDue({ frequency: "WEEKLY", now: at("2026-10-13T04:00:00Z"), lastReportAt: last, timeZone: IST })).toBe(false);
    expect(isReportDue({ frequency: "WEEKLY", now: at("2026-10-13T05:00:00Z"), lastReportAt: last, timeZone: IST })).toBe(true);
    expect(isReportDue({ frequency: "WEEKLY", now: at("2026-10-15T05:00:00Z"), lastReportAt: at("2026-10-13T05:00:00Z"), timeZone: IST })).toBe(false);
  });

  it("monthly: the first Tuesday only", () => {
    // October 2026: Tuesdays are 6, 13, 20, 27. First is the 6th.
    const last = at("2026-09-01T00:00:00Z");
    expect(isReportDue({ frequency: "MONTHLY", now: at("2026-10-06T06:00:00Z"), lastReportAt: last, timeZone: IST })).toBe(true);
    expect(isReportDue({ frequency: "MONTHLY", now: at("2026-10-20T06:00:00Z"), lastReportAt: at("2026-10-06T06:00:00Z"), timeZone: IST })).toBe(false);
  });

  it("catches up after a missed slot", () => {
    expect(isReportDue({ frequency: "WEEKLY", now: at("2026-10-16T00:00:00Z"), lastReportAt: at("2026-10-05T00:00:00Z"), timeZone: IST })).toBe(true);
  });
});
