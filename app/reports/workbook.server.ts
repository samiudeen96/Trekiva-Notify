import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { argb, KPI_STYLE, PALETTE, STATUS_STYLE } from "./palette";
import { shiftToZone } from "./schedule";
import { sharePercent } from "./share";

export interface RequestRow {
  email: string;
  product: string;
  /** "Olive / 6"; empty when the product has a single variant. */
  variant: string;
  sku: string;
  status: "PENDING" | "NOTIFIED" | "UNSUBSCRIBED" | "FAILED";
  pageType: string;
  marketing: boolean;
  requestedAt: Date;
  notifiedAt: Date | null;
  revenue: number;
  /** Shopify numeric ids, for the CSV only. */
  productId?: string;
  variantId?: string;
}

export interface WorkbookInput {
  shopName: string;
  /** e.g. "Weekly report" or "Subscribers export". */
  title: string;
  /** e.g. "13 Oct - 20 Oct 2026". */
  periodLabel: string;
  timeZone: string;
  kpis: { newRequests: number; pending: number; notified: number; unsubscribed: number; failed: number; revenue: number };
  /** Heading above the ranked product list, e.g. "Most requested this period". */
  topTitle: string;
  top: { item: string; count: number }[];
  rows: AsyncIterable<RequestRow> | Iterable<RequestRow>;
  /** When the row list was cut short: how many rows there really are. */
  truncatedFrom?: number;
  now?: Date;
}

/* ---- palette: shared with the PDF report ---- */
const INK = argb(PALETTE.ink);
const INK_SOFT = argb(PALETTE.inkSoft);
const WHITE = argb(PALETTE.white);
const BORDER = argb(PALETTE.border);
const ZEBRA = argb(PALETTE.zebra);
const TEXT = argb(PALETTE.text);
const MUTED = argb(PALETTE.muted);
const GREEN = argb(PALETTE.green);

const STATUS = Object.fromEntries(
  Object.entries(STATUS_STYLE).map(([k, v]) => [k, { label: v.label, fill: argb(v.fill), font: argb(v.font) }]),
) as Record<RequestRow["status"], { label: string; fill: string; font: string }>;

const KPI_TONES = KPI_STYLE.map((t) => ({ fill: argb(t.fill), font: argb(t.font) }));

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = (argb: string): Partial<ExcelJS.Border> => ({ style: "thin", color: { argb } });

const MONEY = '"₹"#,##0.00;-"₹"#,##0.00;"–"';
const DATE_TIME = "dd mmm yyyy, hh:mm";
const FONT = "Calibri";

/** A band across the top of a sheet: brand name, what the sheet is, and the period. */
function banner(ws: ExcelJS.Worksheet, lastCol: string, lines: [string, number, string][]): void {
  lines.forEach(([text, size, color], i) => {
    const row = ws.getRow(i + 1);
    ws.mergeCells(`A${i + 1}:${lastCol}${i + 1}`);
    row.height = i === 0 ? 36 : 20;
    for (let c = 1; c <= lastCol.charCodeAt(0) - 64; c++) row.getCell(c).fill = solid(INK);
    const cell = row.getCell(1);
    cell.value = text;
    cell.font = { name: FONT, size, bold: i < 2, color: { argb: color } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    row.commit();
  });
}

function summarySheet(wb: ExcelJS.stream.xlsx.WorkbookWriter, input: WorkbookInput): void {
  const ws = wb.addWorksheet("Summary", { properties: { tabColor: { argb: GREEN } }, views: [{ showGridLines: false }] });
  ws.columns = [{ width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 22 }];

  banner(ws, "F", [
    ["Trekiva Notify", 20, WHITE],
    [`${input.shopName}  ·  ${input.title}`, 12, WHITE],
    [`${input.periodLabel}  ·  ${input.timeZone}`, 10, INK_SOFT],
  ]);
  ws.getRow(4).commit();

  // KPI cards: a label above a big number, each in its own soft colour.
  const kpis: [string, number | string, boolean][] = [
    ["New requests", input.kpis.newRequests, false],
    ["Pending", input.kpis.pending, false],
    ["Notified", input.kpis.notified, false],
    ["Unsubscribed", input.kpis.unsubscribed, false],
    ["Failed", input.kpis.failed, false],
    ["Revenue converted", input.kpis.revenue, true],
  ];
  const labelRow = ws.getRow(5);
  const valueRow = ws.getRow(6);
  labelRow.height = 22;
  valueRow.height = 38;
  kpis.forEach(([label, value, money], i) => {
    const tone = KPI_TONES[i]!;
    const l = labelRow.getCell(i + 1);
    l.value = label;
    l.font = { name: FONT, size: 10, bold: true, color: { argb: tone.font } };
    l.fill = solid(tone.fill);
    l.alignment = { vertical: "bottom", horizontal: "left", indent: 1 };
    l.border = { left: thin(WHITE), right: thin(WHITE), top: thin(WHITE) };
    const v = valueRow.getCell(i + 1);
    v.value = value;
    v.numFmt = money ? MONEY : "#,##0";
    v.font = { name: FONT, size: 22, bold: true, color: { argb: tone.font } };
    v.fill = solid(tone.fill);
    v.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    v.border = { left: thin(WHITE), right: thin(WHITE), bottom: thin(WHITE) };
  });
  labelRow.commit();
  valueRow.commit();
  ws.getRow(7).commit();

  // Ranked products with a bar made of block characters: it needs no chart support to show.
  const heading = ws.getRow(8);
  ws.mergeCells("A8:F8");
  heading.height = 26;
  heading.getCell(1).value = input.topTitle;
  heading.getCell(1).font = { name: FONT, size: 14, bold: true, color: { argb: TEXT } };
  heading.getCell(1).alignment = { vertical: "middle" };
  heading.commit();

  const head = ws.getRow(9);
  ws.mergeCells("B9:D9");
  head.height = 22;
  [[1, "#"], [2, "Product"], [5, "Requests"], [6, "Share of requests"]].forEach(([c, text]) => {
    const cell = head.getCell(c as number);
    cell.value = text as string;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle", horizontal: c === 5 ? "right" : "left", indent: c === 1 ? 0 : 1 };
  });
  for (let c = 1; c <= 6; c++) head.getCell(c).fill = solid(INK);
  head.commit();

  const maxCount = Math.max(1, ...input.top.map((t) => t.count));
  input.top.forEach((t, i) => {
    const n = 10 + i;
    const row = ws.getRow(n);
    ws.mergeCells(`B${n}:D${n}`);
    row.height = 22;
    row.getCell(1).value = i + 1;
    row.getCell(2).value = t.item;
    row.getCell(5).value = t.count;
    row.getCell(5).numFmt = "#,##0";
    // A short bar (longest = the most requested product) and the real percentage of all requests.
    row.getCell(6).value = `${"█".repeat(Math.max(1, Math.round((t.count / maxCount) * 9)))} ${sharePercent(t.count, input.kpis.newRequests)}`;
    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c);
      cell.font = { name: FONT, size: 11, bold: c === 5, color: { argb: c === 6 ? GREEN : TEXT } };
      cell.alignment = { vertical: "middle", horizontal: c === 5 ? "right" : "left", indent: c === 1 ? 0 : 1 };
      cell.border = { bottom: thin(BORDER) };
      if (i % 2 === 1) cell.fill = solid(ZEBRA);
    }
    row.commit();
  });

  if (input.top.length === 0) {
    const row = ws.getRow(10);
    ws.mergeCells("A10:F10");
    row.getCell(1).value = "Nothing to rank yet.";
    row.getCell(1).font = { name: FONT, size: 11, italic: true, color: { argb: MUTED } };
    row.commit();
  }

  const noteRow = ws.getRow(10 + Math.max(1, input.top.length) + 1);
  ws.mergeCells(`A${noteRow.number}:F${noteRow.number}`);
  noteRow.getCell(1).value = "Every request is listed, with filters, on the Requests sheet.";
  noteRow.getCell(1).font = { name: FONT, size: 10, italic: true, color: { argb: MUTED } };
  noteRow.commit();
  ws.commit();
}

const COLUMNS: { key: string; header: string; width: number; align: "left" | "center" | "right" }[] = [
  { key: "email", header: "Email", width: 32, align: "left" },
  { key: "product", header: "Product", width: 42, align: "left" },
  { key: "variant", header: "Variant", width: 20, align: "left" },
  { key: "sku", header: "SKU", width: 16, align: "left" },
  { key: "status", header: "Status", width: 15, align: "center" },
  { key: "requested", header: "Requested", width: 21, align: "left" },
  { key: "notified", header: "Notified", width: 21, align: "left" },
  { key: "page", header: "Page", width: 13, align: "left" },
  { key: "marketing", header: "Marketing", width: 12, align: "center" },
  { key: "revenue", header: "Revenue", width: 15, align: "right" },
];
/** 1-based column number of a column key: formats and colours follow the key, not a hard-coded number. */
const COL = Object.fromEntries(COLUMNS.map((c, i) => [c.key, i + 1])) as Record<string, number>;

async function requestsSheet(wb: ExcelJS.stream.xlsx.WorkbookWriter, input: WorkbookInput): Promise<number> {
  const HEADER_ROW = 4;
  const ws = wb.addWorksheet("Requests", {
    properties: { tabColor: { argb: argb(PALETTE.blue) } },
    // Header stays in view while scrolling, and so does the email column.
    views: [{ state: "frozen", xSplit: 1, ySplit: HEADER_ROW, showGridLines: false }],
  });
  ws.columns = COLUMNS.map((c) => ({ width: c.width }));
  const lastCol = String.fromCharCode(64 + COLUMNS.length);

  banner(ws, lastCol, [
    ["Requests", 18, WHITE],
    [`${input.shopName}  ·  ${input.title}`, 11, WHITE],
    [`${input.periodLabel}  ·  times shown in ${input.timeZone}`, 10, INK_SOFT],
  ]);

  const head = ws.getRow(HEADER_ROW);
  head.height = 26;
  COLUMNS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: WHITE } };
    cell.fill = solid(GREEN);
    cell.alignment = { vertical: "middle", horizontal: c.align, indent: c.align === "left" ? 1 : 0 };
    cell.border = { bottom: { style: "medium", color: { argb: INK } } };
  });
  head.commit();

  let n = HEADER_ROW;
  let count = 0;
  for await (const r of input.rows) {
    n++;
    count++;
    const row = ws.getRow(n);
    row.height = 20;
    const values: (string | number | Date | null)[] = [
      r.email,
      r.product,
      r.variant,
      r.sku,
      STATUS[r.status].label,
      shiftToZone(r.requestedAt, input.timeZone),
      r.notifiedAt ? shiftToZone(r.notifiedAt, input.timeZone) : "",
      r.pageType || "",
      r.marketing ? "Yes" : "No",
      r.revenue,
    ];
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { name: FONT, size: 11, color: { argb: TEXT } };
      cell.alignment = { vertical: "middle", horizontal: COLUMNS[i]!.align, indent: COLUMNS[i]!.align === "left" ? 1 : 0 };
      cell.border = { bottom: thin(BORDER) };
      if (count % 2 === 0) cell.fill = solid(ZEBRA);
    });
    row.getCell(COL.requested!).numFmt = DATE_TIME;
    row.getCell(COL.notified!).numFmt = DATE_TIME;
    row.getCell(COL.revenue!).numFmt = MONEY;
    const st = STATUS[r.status];
    const status = row.getCell(COL.status!);
    status.fill = solid(st.fill);
    status.font = { name: FONT, size: 11, bold: true, color: { argb: st.font } };
    row.commit();
  }

  if (count === 0) {
    n++;
    const row = ws.getRow(n);
    ws.mergeCells(`A${n}:${lastCol}${n}`);
    row.getCell(1).value = "No requests to show.";
    row.getCell(1).font = { name: FONT, size: 11, italic: true, color: { argb: MUTED } };
    row.commit();
  }

  if (input.truncatedFrom) {
    n += 2;
    const row = ws.getRow(n);
    ws.mergeCells(`A${n}:${lastCol}${n}`);
    row.getCell(1).value = `Showing the first ${count.toLocaleString("en-IN")} of ${input.truncatedFrom.toLocaleString("en-IN")} requests. Narrow the filters to export the rest.`;
    row.getCell(1).font = { name: FONT, size: 10, italic: true, color: { argb: argb(PALETTE.danger) } };
    row.commit();
  }

  if (count > 0) ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW + count, column: COLUMNS.length } };
  ws.commit();
  return count;
}

/** The finished .xlsx file. Rows are written as they arrive, so a long list never sits in memory twice. */
export async function buildWorkbook(input: WorkbookInput): Promise<{ buffer: Buffer; rows: number }> {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: true });
  wb.creator = "Trekiva Notify";
  wb.lastModifiedBy = "Trekiva Notify";
  wb.created = input.now ?? new Date();
  wb.modified = input.now ?? new Date();

  summarySheet(wb, input);
  const rows = await requestsSheet(wb, input);
  await wb.commit();
  await finished;
  return { buffer: Buffer.concat(chunks), rows };
}
