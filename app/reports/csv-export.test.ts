import { describe, expect, it } from "vitest";
import { CSV_HEADER, csvLine } from "./csv-export";
import type { RequestRow } from "./workbook.server";

const row: RequestRow = {
  email: "buyer@example.com",
  product: "Men's Slip-On Sandals",
  variant: "Olive / 6",
  sku: "TPG-3001-OLV-6",
  status: "NOTIFIED",
  pageType: "product",
  marketing: true,
  requestedAt: new Date("2026-10-14T05:00:00Z"),
  notifiedAt: new Date("2026-10-14T06:30:00Z"),
  revenue: 720,
  productId: "9001",
  variantId: "4401",
};

describe("csv export", () => {
  it("leads with names the ecommerce team can read, ids last", () => {
    expect(CSV_HEADER).toBe("Email,Product,Variant,SKU,Status,Requested,Notified,Page,Marketing opt-in,Revenue,Product ID,Variant ID");
  });

  it("writes product, variant and sku as text, status as a word and times in the shop's zone", () => {
    expect(csvLine(row, "Asia/Kolkata")).toBe(
      "buyer@example.com,Men's Slip-On Sandals,Olive / 6,TPG-3001-OLV-6,Notified,2026-10-14 10:30,2026-10-14 12:00,product,Yes,720.00,9001,4401",
    );
  });

  it("leaves empty cells for what does not exist yet", () => {
    const line = csvLine({ ...row, status: "PENDING", notifiedAt: null, revenue: 0, marketing: false, variant: "", sku: "" }, "UTC");
    expect(line).toBe("buyer@example.com,Men's Slip-On Sandals,,,Pending,2026-10-14 05:00,,product,No,,9001,4401");
  });

  it("quotes names with commas and defuses formulas", () => {
    expect(csvLine({ ...row, product: 'Sandal, "pro"', variant: "=1+1" }, "UTC")).toContain(`"Sandal, ""pro""",'=1+1`);
  });
});
