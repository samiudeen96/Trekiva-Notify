import { describe, expect, it } from "vitest";
import { money, percent, timeAgo } from "./format";

const now = new Date("2026-10-14T12:00:00Z");

describe("timeAgo", () => {
  it("uses the smallest sensible unit", () => {
    expect(timeAgo(new Date("2026-10-14T11:59:40Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-10-14T11:55:00Z"), now)).toBe("5 min ago");
    expect(timeAgo(new Date("2026-10-14T09:00:00Z"), now)).toBe("3 h ago");
    expect(timeAgo(new Date("2026-10-12T12:00:00Z"), now)).toBe("2 d ago");
  });
  it("falls back to a date after a week and accepts ISO strings", () => {
    expect(timeAgo("2026-09-01T00:00:00Z", now)).toMatch(/Sep/);
  });
  it("never shows a negative time", () => {
    expect(timeAgo(new Date("2026-10-14T12:05:00Z"), now)).toBe("just now");
  });
});

describe("percent", () => {
  it("handles zero and rounds", () => {
    expect(percent(1, 0)).toBe("-");
    expect(percent(1, 3)).toBe("33%");
    expect(percent(1, 40)).toBe("2.5%");
    expect(percent(0, 5)).toBe("0%");
  });
});

describe("money", () => {
  it("formats rupees", () => {
    expect(money(1234.5)).toBe("₹1,234.50");
  });
});
