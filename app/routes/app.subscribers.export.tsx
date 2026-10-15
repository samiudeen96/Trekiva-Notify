import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { CSV_HEADER, csvLine } from "../reports/csv-export";
import { exportFiles, MAX_EXPORT_ROWS, requestRows } from "../reports/export.server";
import { shopBasics } from "../shopify/shop.server";

const STATUSES = ["PENDING", "NOTIFIED", "UNSUBSCRIBED", "FAILED"] as const;

// Fetched with the session token (App Bridge), then saved by the page: see app.subscribers._index.tsx.
// ?format=xlsx|csv, and the same ?status= and ?q= filters the list uses.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const statusParam = url.searchParams.get("status") ?? "";
  // An unknown value from the address bar is ignored, never passed to the query.
  const status = (STATUSES as readonly string[]).includes(statusParam) ? (statusParam as (typeof STATUSES)[number]) : undefined;

  const where = {
    shopDomain: session.shop,
    ...(status ? { status } : {}),
    ...(q ? { emailNormalized: { contains: q } } : {}),
  };
  const filtered = Boolean(status || q);

  const format = url.searchParams.get("format");
  if (format === "xlsx" || format === "pdf") {
    const shop = await shopBasics(admin, session.shop);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: shop.timeZone }).format(new Date());
    const { files } = await exportFiles({
      shopDomain: session.shop,
      admin,
      formats: [format],
      fileBase: `trekiva-notify-subscribers-${today}`,
      title: filtered ? "Subscribers export (filtered)" : "Subscribers export",
      periodLabel: `Exported ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: shop.timeZone }).format(new Date())}`,
      topTitle: filtered ? "Most requested in this export" : "Most requested overall",
      where,
      shop,
    });
    const file = files[0]!;
    return new Response(new Uint8Array(file.content), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Same names the notify email uses: product, variant and SKU come from Shopify, the ids are kept at the end.
  const { timeZone } = await shopBasics(admin, session.shop);
  const lines = [CSV_HEADER];
  for await (const r of requestRows(where, admin, MAX_EXPORT_ROWS)) lines.push(csvLine(r, timeZone));
  return new Response("\ufeff" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="trekiva-notify-subscribers.csv"',
      "Cache-Control": "no-store",
    },
  });
};
