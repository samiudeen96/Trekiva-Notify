import { describe, expect, it } from "vitest";
import { countedStock, retryDelayMinutes, shouldNotify } from "./decision";

const levels = [
  { locationId: "gid://shopify/Location/1", available: 0 },
  { locationId: "gid://shopify/Location/2", available: 3 },
];

describe("shouldNotify", () => {
  it("notifies when total stock reaches the threshold", () => {
    expect(shouldNotify({ eventLocationId: "gid://shopify/Location/2", enabledLocationIds: [], levels, threshold: 1 })).toBe(true);
  });

  it("waits while stock is below the threshold", () => {
    expect(shouldNotify({ eventLocationId: "gid://shopify/Location/2", enabledLocationIds: [], levels, threshold: 5 })).toBe(false);
  });

  it("ignores a change at a location the merchant did not tick", () => {
    expect(
      shouldNotify({
        eventLocationId: "gid://shopify/Location/2",
        enabledLocationIds: ["gid://shopify/Location/1"],
        levels,
        threshold: 1,
      }),
    ).toBe(false);
  });

  it("counts only ticked locations toward the threshold", () => {
    expect(countedStock(levels, ["gid://shopify/Location/1"])).toBe(0);
    expect(countedStock(levels, [])).toBe(3);
  });

  it("never treats a zero threshold as 'always notify'", () => {
    expect(shouldNotify({ eventLocationId: null, enabledLocationIds: [], levels: [{ locationId: "a", available: 0 }], threshold: 0 })).toBe(false);
  });

  it("ignores negative available quantities", () => {
    expect(countedStock([{ locationId: "a", available: -2 }, { locationId: "b", available: 1 }], [])).toBe(1);
  });
});

describe("retryDelayMinutes", () => {
  it("backs off exponentially", () => {
    expect([1, 2, 3, 4, 5].map(retryDelayMinutes)).toEqual([1, 2, 4, 8, 16]);
  });
});
