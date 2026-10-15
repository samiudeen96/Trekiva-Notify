import path from "node:path";
import PDFDocument from "pdfkit";
import { hash, KPI_LABELS, KPI_STYLE, PALETTE, STATUS_STYLE } from "./palette";
import type { RequestRow, WorkbookInput } from "./workbook.server";

/** A PDF is for reading and printing, not for data: a few hundred rows is the useful limit. */
export const MAX_PDF_ROWS = 500;

const FONT_DIR = path.resolve(process.cwd(), "assets/fonts");
const REGULAR = "NotoSans";
const BOLD = "NotoSans-Bold";

// A4 landscape, in points.
const W = 841.89;
const H = 595.28;
const M = 36;
const FOOTER_Y = H - 26;

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const stamp = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone })
    .format(d)
    .replace(",", "");

type Doc = InstanceType<typeof PDFDocument>;

function banner(doc: Doc, height: number, lines: { text: string; size: number; bold?: boolean; color: string; y: number }[]): void {
  doc.rect(0, 0, W, height).fill(hash(PALETTE.ink));
  doc.rect(0, height, W, 4).fill(hash(PALETTE.green));
  for (const l of lines) {
    doc.font(l.bold ? BOLD : REGULAR).fontSize(l.size).fillColor(hash(l.color)).text(l.text, M, l.y, { width: W - 2 * M, lineBreak: false });
  }
}

function summaryPage(doc: Doc, input: WorkbookInput): void {
  banner(doc, 112, [
    { text: "Trekiva Notify", size: 28, bold: true, color: PALETTE.white, y: 26 },
    { text: `${input.shopName}  ·  ${input.title}`, size: 13, bold: true, color: PALETTE.white, y: 64 },
    { text: `${input.periodLabel}  ·  ${input.timeZone}`, size: 10, color: PALETTE.inkSoft, y: 86 },
  ]);

  // Six cards in a row: a small label, a big number, each in its own soft colour.
  const k = input.kpis;
  const values: (number | string)[] = [k.newRequests, k.pending, k.notified, k.unsubscribed, k.failed, money(k.revenue)];
  const gap = 10;
  const cardW = (W - 2 * M - 5 * gap) / 6;
  const cardY = 142;
  values.forEach((v, i) => {
    const x = M + i * (cardW + gap);
    const tone = KPI_STYLE[i]!;
    doc.roundedRect(x, cardY, cardW, 76, 8).fill(hash(tone.fill));
    doc.font(BOLD).fontSize(9).fillColor(hash(tone.font)).text(KPI_LABELS[i]!, x + 12, cardY + 14, { width: cardW - 24, lineBreak: false });
    const isMoney = i === 5;
    doc.font(BOLD).fontSize(isMoney ? 17 : 24).fillColor(hash(tone.font))
      .text(typeof v === "number" ? v.toLocaleString("en-IN") : v, x + 12, cardY + (isMoney ? 38 : 34), { width: cardW - 24, lineBreak: false });
  });

  // Ranked products with real bars.
  doc.font(BOLD).fontSize(14).fillColor(hash(PALETTE.text)).text(input.topTitle, M, 244, { lineBreak: false });
  const headY = 270;
  doc.rect(M, headY, W - 2 * M, 24).fill(hash(PALETTE.ink));
  doc.font(BOLD).fontSize(9).fillColor(hash(PALETTE.white));
  const barX = W - M - 250;
  doc.text("#", M + 12, headY + 8, { lineBreak: false });
  doc.text("Product", M + 44, headY + 8, { lineBreak: false });
  doc.text("Requests", barX - 70, headY + 8, { width: 56, align: "right", lineBreak: false });
  doc.text("Share", barX, headY + 8, { lineBreak: false });

  const rowH = 24;
  const max = Math.max(1, ...input.top.map((t) => t.count));
  input.top.forEach((t, i) => {
    const y = headY + 24 + i * rowH;
    if (i % 2 === 1) doc.rect(M, y, W - 2 * M, rowH).fill(hash(PALETTE.zebra));
    doc.rect(M, y + rowH - 0.5, W - 2 * M, 0.5).fill(hash(PALETTE.border));
    doc.font(BOLD).fontSize(10).fillColor(hash(PALETTE.muted)).text(String(i + 1), M + 12, y + 7, { lineBreak: false });
    doc.font(REGULAR).fontSize(10).fillColor(hash(PALETTE.text)).text(t.item, M + 44, y + 7, { width: barX - 140, height: 12, ellipsis: true, lineBreak: false });
    doc.font(BOLD).fontSize(10).fillColor(hash(PALETTE.text)).text(t.count.toLocaleString("en-IN"), barX - 70, y + 7, { width: 56, align: "right", lineBreak: false });
    doc.roundedRect(barX, y + 9, 220, 7, 3.5).fill(hash("EEF0F2"));
    doc.roundedRect(barX, y + 9, Math.max(7, (220 * t.count) / max), 7, 3.5).fill(hash(PALETTE.green));
  });
  if (input.top.length === 0) {
    doc.font(REGULAR).fontSize(10).fillColor(hash(PALETTE.muted)).text("Nothing to rank yet.", M + 12, headY + 36, { lineBreak: false });
  }

  doc.font(REGULAR).fontSize(9).fillColor(hash(PALETTE.muted))
    .text("Every request is listed on the following pages.", M, headY + 24 + Math.max(1, input.top.length) * rowH + 14, { lineBreak: false });
}

// Column x offsets and widths of the requests table (770 pt wide in total).
const COLS = [
  { header: "Email", x: 0, w: 170 },
  { header: "Product", x: 170, w: 190 },
  { header: "Variant", x: 360, w: 90 },
  { header: "Status", x: 450, w: 84 },
  { header: "Requested", x: 534, w: 118 },
  { header: "Notified", x: 652, w: 118 },
] as const;

const ROW_H = 24;
const TABLE_TOP = 96;

function requestsPageStart(doc: Doc, input: WorkbookInput): number {
  doc.addPage();
  doc.rect(0, 0, W, 54).fill(hash(PALETTE.ink));
  doc.rect(0, 54, W, 3).fill(hash(PALETTE.green));
  doc.font(BOLD).fontSize(17).fillColor(hash(PALETTE.white)).text("Requests", M, 17, { lineBreak: false });
  doc.font(REGULAR).fontSize(9).fillColor(hash(PALETTE.inkSoft))
    .text(`${input.shopName}  ·  ${input.title}  ·  ${input.periodLabel}`, M, 21, { width: W - 2 * M, align: "right", lineBreak: false });

  doc.rect(M, TABLE_TOP - 26, W - 2 * M, 26).fill(hash(PALETTE.green));
  doc.font(BOLD).fontSize(9.5).fillColor(hash(PALETTE.white));
  for (const c of COLS) doc.text(c.header, M + c.x + 8, TABLE_TOP - 17, { width: c.w - 12, lineBreak: false });
  return TABLE_TOP;
}

function requestRow(doc: Doc, r: RequestRow, y: number, index: number, timeZone: string): void {
  if (index % 2 === 1) doc.rect(M, y, W - 2 * M, ROW_H).fill(hash(PALETTE.zebra));
  doc.rect(M, y + ROW_H - 0.5, W - 2 * M, 0.5).fill(hash(PALETTE.border));
  const text = (value: string, col: (typeof COLS)[number], bold = false) =>
    doc.font(bold ? BOLD : REGULAR).fontSize(9).fillColor(hash(PALETTE.text))
      .text(value, M + col.x + 8, y + 8, { width: col.w - 14, height: 11, ellipsis: true, lineBreak: false });

  text(r.email, COLS[0]);
  text(r.product, COLS[1]);
  text(r.variant || "–", COLS[2]);

  const st = STATUS_STYLE[r.status];
  doc.roundedRect(M + COLS[3].x + 8, y + 5, 68, 14, 7).fill(hash(st.fill));
  doc.font(BOLD).fontSize(8).fillColor(hash(st.font)).text(st.label, M + COLS[3].x + 8, y + 7.5, { width: 68, align: "center", lineBreak: false });

  text(stamp(r.requestedAt, timeZone), COLS[4]);
  text(r.notifiedAt ? stamp(r.notifiedAt, timeZone) : "–", COLS[5]);
}

/** The finished PDF: a summary page, then the requests table (up to MAX_PDF_ROWS rows) with a repeating header. */
export async function buildPdf(input: WorkbookInput & { maxRows?: number }): Promise<{ buffer: Buffer; rows: number }> {
  const cap = input.maxRows ?? MAX_PDF_ROWS;
  const rows: RequestRow[] = [];
  for await (const r of input.rows) {
    if (rows.length >= cap) break;
    rows.push(r);
  }

  const doc = new PDFDocument({
    size: [W, H],
    margin: 0,
    bufferPages: true,
    info: { Title: `${input.title} - ${input.shopName}`, Author: "Trekiva Notify", Creator: "Trekiva Notify" },
  });
  doc.registerFont(REGULAR, path.join(FONT_DIR, "NotoSans-Regular.ttf"));
  doc.registerFont(BOLD, path.join(FONT_DIR, "NotoSans-Bold.ttf"));

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  summaryPage(doc, input);

  let y = requestsPageStart(doc, input);
  if (rows.length === 0) {
    doc.font(REGULAR).fontSize(11).fillColor(hash(PALETTE.muted)).text("No requests to show.", M + 8, y + 10, { lineBreak: false });
  }
  rows.forEach((r, i) => {
    if (y + ROW_H > H - 44) y = requestsPageStart(doc, input);
    requestRow(doc, r, y, i, input.timeZone);
    y += ROW_H;
  });

  const total = input.truncatedFrom ?? rows.length;
  if (rows.length > 0 && total > rows.length) {
    if (y + 30 > H - 44) y = requestsPageStart(doc, input);
    doc.font(REGULAR).fontSize(9).fillColor(hash(PALETTE.danger)).text(
      `Showing the latest ${rows.length.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} requests. The Excel file has every row.`,
      M + 8, y + 12, { lineBreak: false },
    );
  }

  // Page footers go on last, when the page count is known.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.font(REGULAR).fontSize(8).fillColor(hash(PALETTE.muted));
    doc.text(`Trekiva Notify  ·  ${input.shopName}`, M, FOOTER_Y, { lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, M, FOOTER_Y, { width: W - 2 * M, align: "right", lineBreak: false });
  }

  doc.end();
  await finished;
  return { buffer: Buffer.concat(chunks), rows: rows.length };
}
