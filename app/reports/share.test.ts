import { describe, expect, it } from "vitest";
import { sharePercent } from "./share";

describe("sharePercent", () => {
  it("is the part of the total, rounded", () => {
    expect(sharePercent(4, 9)).toBe("44%");
    expect(sharePercent(9, 9)).toBe("100%");
  });
  it("handles tiny and empty cases", () => {
    expect(sharePercent(1, 500)).toBe("<1%");
    expect(sharePercent(0, 10)).toBe("-");
    expect(sharePercent(3, 0)).toBe("-");
  });
});
