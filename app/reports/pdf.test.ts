import { describe, expect, it } from "vitest";
import { formatsFor } from "./format";
import { buildPdf } from "./pdf.server";
import type { RequestRow, WorkbookInput } from "./workbook.server";

const row = (i: number): RequestRow => ({
  email: `customer${i}@example.com`,
  product: "Men's Slip-On Sandals",
  variant: "Olive / 6",
  sku: "TPG-3001-OLV-6",
  status: "PENDING",
  pageType: "product",
  marketing: false,
  requestedAt: new Date("2026-10-14T05:00:00Z"),
  notifiedAt: null,
  revenue: 0,
});

const base = (rows: RequestRow[], over: Partial<WorkbookInput> = {}): WorkbookInput & { maxRows?: number } => ({
  shopName: "Trekiva",
  title: "Weekly report",
  periodLabel: "7 Oct - 14 Oct 2026",
  timeZone: "Asia/Kolkata",
  kpis: { newRequests: rows.length, pending: 5, notified: 3, unsubscribed: 1, failed: 0, revenue: 1440 },
  topTitle: "Most requested this period",
  top: [{ item: "Sandals - Olive / 6", count: 4 }],
  rows,
  ...over,
});

const pageCount = (buf: Buffer) => (buf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;

describe("buildPdf", () => {
  it("makes a PDF with a summary page and a requests page", async () => {
    const { buffer, rows } = await buildPdf(base([row(1), row(2)]));
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(rows).toBe(2);
    expect(pageCount(buffer)).toBe(2);
  });

  it("starts a new page when the table is full", async () => {
    const { buffer } = await buildPdf(base(Array.from({ length: 40 }, (_, i) => row(i))));
    expect(pageCount(buffer)).toBeGreaterThanOrEqual(3);
  });

  it("stops at the row limit and reports how many it wrote", async () => {
    const { rows } = await buildPdf({ ...base(Array.from({ length: 30 }, (_, i) => row(i))), maxRows: 10, truncatedFrom: 30 });
    expect(rows).toBe(10);
  });

  it("works with nothing to list", async () => {
    const { buffer, rows } = await buildPdf(base([], { top: [] }));
    expect(rows).toBe(0);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("accepts an async stream of rows", async () => {
    async function* gen() {
      for (let i = 0; i < 50; i++) yield row(i);
    }
    expect((await buildPdf(base([], { rows: gen() }))).rows).toBe(50);
  });
});

describe("formatsFor", () => {
  it("maps the saved choice to file types, Excel by default", () => {
    expect(formatsFor("EXCEL")).toEqual(["xlsx"]);
    expect(formatsFor("PDF")).toEqual(["pdf"]);
    expect(formatsFor("BOTH")).toEqual(["xlsx", "pdf"]);
    expect(formatsFor(null)).toEqual(["xlsx"]);
    expect(formatsFor("nonsense")).toEqual(["xlsx"]);
  });
});
