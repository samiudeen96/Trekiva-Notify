import { csvRow } from "../subscriptions/csv";
import { shiftToZone } from "./schedule";
import { STATUS_STYLE } from "./palette";
import type { RequestRow } from "./workbook.server";

/** Same columns as the Excel sheet, in the same order, then the raw ids for anyone matching them in another system. */
export const CSV_HEADER = csvRow([
  "Email",
  "Product",
  "Variant",
  "SKU",
  "Status",
  "Requested",
  "Notified",
  "Page",
  "Marketing opt-in",
  "Revenue",
  "Product ID",
  "Variant ID",
]);

/** 2026-10-14 10:30 in the shop's time zone: readable, and sorts correctly as text. */
function localStamp(d: Date, timeZone: string): string {
  return shiftToZone(d, timeZone).toISOString().slice(0, 16).replace("T", " ");
}

export function csvLine(r: RequestRow, timeZone: string): string {
  return csvRow([
    r.email,
    r.product,
    r.variant,
    r.sku,
    STATUS_STYLE[r.status].label,
    localStamp(r.requestedAt, timeZone),
    r.notifiedAt ? localStamp(r.notifiedAt, timeZone) : "",
    r.pageType,
    r.marketing ? "Yes" : "No",
    r.revenue ? r.revenue.toFixed(2) : "",
    r.productId ?? "",
    r.variantId ?? "",
  ]);
}
