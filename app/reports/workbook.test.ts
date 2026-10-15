import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildWorkbook, type RequestRow, type WorkbookInput } from "./workbook.server";

const row = (i: number, over: Partial<RequestRow> = {}): RequestRow => ({
  email: `customer${i}@example.com`,
  product: "Men's Slip-On Sandals",
  variant: "Olive / 6",
  sku: "TPG-3001-OLV-6",
  status: "PENDING",
  pageType: "product",
  marketing: i % 2 === 0,
  requestedAt: new Date("2026-10-14T05:00:00Z"),
  notifiedAt: null,
  revenue: 0,
  ...over,
});

const base = (rows: RequestRow[], over: Partial<WorkbookInput> = {}): WorkbookInput => ({
  shopName: "Trekiva",
  title: "Weekly report",
  periodLabel: "7 Oct - 14 Oct 2026",
  timeZone: "Asia/Kolkata",
  kpis: { newRequests: rows.length, pending: 5, notified: 3, unsubscribed: 1, failed: 0, revenue: 1440 },
  topTitle: "Most requested this period",
  top: [{ item: "Sandals - Olive / 6", count: 4 }, { item: "Trail Runner - Black / 9", count: 2 }],
  rows,
  now: new Date("2026-10-14T06:00:00Z"),
  ...over,
});

async function load(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

describe("buildWorkbook", () => {
  it("writes a Summary and a Requests sheet", async () => {
    const { buffer, rows } = await buildWorkbook(base([row(1), row(2)]));
    const wb = await load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Requests"]);
    expect(rows).toBe(2);
  });

  it("fills the summary with the numbers and the ranked products", async () => {
    const wb = await load((await buildWorkbook(base([row(1)]))).buffer);
    const ws = wb.getWorksheet("Summary")!;
    expect(ws.getCell("A1").value).toBe("Trekiva Notify");
    expect(ws.getCell("A5").value).toBe("New requests");
    expect(ws.getCell("A6").value).toBe(1);
    expect(ws.getCell("F6").value).toBe(1440);
    expect(ws.getCell("A8").value).toBe("Most requested this period");
    expect(ws.getCell("B10").value).toBe("Sandals - Olive / 6");
    expect(ws.getCell("E10").value).toBe(4);
    expect(String(ws.getCell("F10").value)).toMatch(/^█+ \d+%$/);
  });

  it("lists every request under a styled, filterable, frozen header", async () => {
    const wb = await load((await buildWorkbook(base([row(1), row(2, { status: "NOTIFIED", notifiedAt: new Date("2026-10-14T06:00:00Z"), revenue: 720 })]))).buffer);
    const ws = wb.getWorksheet("Requests")!;
    expect(ws.getRow(4).values).toEqual([undefined, "Email", "Product", "Variant", "SKU", "Status", "Requested", "Notified", "Page", "Marketing", "Revenue"]);
    expect(ws.getCell("A5").value).toBe("customer1@example.com");
    // Product, variant and SKU are separate columns, so the team can filter by each.
    expect(ws.getCell("B5").value).toBe("Men's Slip-On Sandals");
    expect(ws.getCell("C5").value).toBe("Olive / 6");
    expect(ws.getCell("D5").value).toBe("TPG-3001-OLV-6");
    expect(ws.getCell("E5").value).toBe("Pending");
    expect(ws.getCell("E6").value).toBe("Notified");
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 4, xSplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    // The status cell carries its colour.
    expect((ws.getCell("E6").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFE3F5EC");
    expect(ws.getCell("J6").value).toBe(720);
    expect(ws.getCell("J6").numFmt).toContain("#,##0.00");
  });

  it("writes times in the shop's local time", async () => {
    const wb = await load((await buildWorkbook(base([row(1)]))).buffer);
    const d = wb.getWorksheet("Requests")!.getCell("F5").value as Date;
    // 05:00 UTC is 10:30 in Kolkata.
    expect(d.toISOString()).toBe("2026-10-14T10:30:00.000Z");
  });

  it("says so when there is nothing to list", async () => {
    const { buffer, rows } = await buildWorkbook(base([], { top: [] }));
    const ws = (await load(buffer)).getWorksheet("Requests")!;
    expect(rows).toBe(0);
    expect(ws.getCell("A5").value).toBe("No requests to show.");
  });

  it("notes when the list was cut short", async () => {
    const { buffer } = await buildWorkbook(base([row(1)], { truncatedFrom: 80_000 }));
    const ws = (await load(buffer)).getWorksheet("Requests")!;
    expect(String(ws.getCell("A7").value)).toContain("of 80,000 requests");
  });

  it("accepts an async stream of rows", async () => {
    async function* gen() {
      for (let i = 0; i < 1200; i++) yield row(i);
    }
    const { buffer, rows } = await buildWorkbook(base([], { rows: gen() }));
    expect(rows).toBe(1200);
    expect((await load(buffer)).getWorksheet("Requests")!.rowCount).toBeGreaterThanOrEqual(1204);
  });
});
