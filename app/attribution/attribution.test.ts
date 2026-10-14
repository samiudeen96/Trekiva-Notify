import { describe, expect, it } from "vitest";
import { extractNotifyId, revenueForVariant, withinWindow } from "./attribution";

const id = "cmabcdefghij1234567890xyz";

describe("extractNotifyId", () => {
  it("reads the cart attribute", () => {
    expect(extractNotifyId({ note_attributes: [{ name: "trekiva_notify", value: id }] })).toBe(id);
  });
  it("falls back to the landing page query", () => {
    expect(extractNotifyId({ landing_site: `/products/x?variant=1&notify=${id}` })).toBe(id);
  });
  it("ignores malformed ids", () => {
    expect(extractNotifyId({ note_attributes: [{ name: "trekiva_notify", value: "x'; DROP" }] })).toBeNull();
    expect(extractNotifyId({})).toBeNull();
  });
});

describe("revenueForVariant", () => {
  it("counts only the notified variant, after discounts", () => {
    const lines = [
      { variant_id: 11, price: "720.00", quantity: 2, total_discount: "40.00" },
      { variant_id: 12, price: "999.00", quantity: 1 },
    ];
    expect(revenueForVariant(lines, "11")).toBe(1400);
  });
  it("is zero when the variant is not in the order", () => {
    expect(revenueForVariant([{ variant_id: 12, price: "5", quantity: 1 }], "11")).toBe(0);
  });
});

describe("withinWindow", () => {
  const notified = new Date("2026-10-01T00:00:00Z");
  it("accepts an order inside 7 days", () => {
    expect(withinWindow(notified, new Date("2026-10-07T23:00:00Z"))).toBe(true);
  });
  it("rejects later orders, earlier orders and never-notified", () => {
    expect(withinWindow(notified, new Date("2026-10-09T00:00:00Z"))).toBe(false);
    expect(withinWindow(notified, new Date("2026-09-30T00:00:00Z"))).toBe(false);
    expect(withinWindow(null, new Date())).toBe(false);
  });
});
