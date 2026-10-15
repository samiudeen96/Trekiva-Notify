import type { Prisma } from "@prisma/client";
import db from "../db.server";
import { detailOrUnknown, variantDetails, type VariantDetail } from "../shopify/labels.server";
import { shopBasics } from "../shopify/shop.server";
import { buildPdf, MAX_PDF_ROWS } from "./pdf.server";
import { buildWorkbook, type RequestRow } from "./workbook.server";

interface AdminGraphqlClient {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
}

/** An Excel sheet holds 1,048,576 rows, but a file this size is already a few MB and opens instantly. */
export const MAX_EXPORT_ROWS = 50_000;
const BATCH = 1000;
const TOP_PRODUCTS = 10;

/** "Product - Variant", the one-line name used in the Summary ranking. */
const oneLine = (d: VariantDetail) => (d.variant ? `${d.product} - ${d.variant}` : d.product);

/**
 * Streams the rows of `where` newest first in batches, with product names looked up per batch. A cursor
 * (not skip/offset) keeps every batch as cheap as the first, however far into the list it is.
 */
export async function* requestRows(
  where: Prisma.SubscriptionWhereInput,
  admin: AdminGraphqlClient,
  limit: number,
): AsyncGenerator<RequestRow> {
  const details: Record<string, VariantDetail> = {};
  let cursor: string | undefined;
  let sent = 0;
  while (sent < limit) {
    const batch = await db.subscription.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(BATCH, limit - sent),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) return;

    const missing = batch.map((r) => r.variantId).filter((id) => !(id in details));
    Object.assign(details, await variantDetails(admin, missing));

    for (const r of batch) {
      const d = detailOrUnknown(details, r.variantId);
      yield {
        email: r.email,
        product: d.product,
        variant: d.variant,
        sku: d.sku,
        status: r.status,
        pageType: r.pageType ?? "",
        marketing: r.marketingOptIn,
        requestedAt: r.createdAt,
        notifiedAt: r.notifiedAt,
        revenue: r.revenue ? Number(r.revenue) : 0,
        productId: r.productId.split("/").pop() ?? "",
        variantId: r.variantId.split("/").pop() ?? "",
      };
    }
    sent += batch.length;
    cursor = batch[batch.length - 1]!.id;
    if (batch.length < BATCH) return;
  }
}

export type FileFormat = "xlsx" | "pdf";

export interface ExportFile {
  format: FileFormat;
  filename: string;
  content: Buffer;
  mime: string;
}

export const MIME: Record<FileFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/**
 * The files for one set of requests: a Summary (totals for the whole shop, the most requested products
 * among `where`) and every row of `where`, as Excel and/or PDF. The Excel file holds every row; the PDF
 * holds the latest few hundred, since it is for reading.
 */
export async function exportFiles(opts: {
  shopDomain: string;
  admin: AdminGraphqlClient;
  formats: FileFormat[];
  /** File name without extension, e.g. "trekiva-notify-weekly-report-2026-10-20". */
  fileBase: string;
  title: string;
  periodLabel: string;
  topTitle: string;
  where: Prisma.SubscriptionWhereInput;
  /** Already known by the caller (the report job looked them up); looked up here when absent. */
  shop?: { name: string; timeZone: string };
  now?: Date;
}): Promise<{ files: ExportFile[]; total: number }> {
  const shop = opts.shop ?? (await shopBasics(opts.admin, opts.shopDomain));
  const scope = { shopDomain: opts.shopDomain };

  const [byStatus, revenue, total, topGroups] = await Promise.all([
    db.subscription.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    db.subscription.aggregate({ where: scope, _sum: { revenue: true } }),
    db.subscription.count({ where: opts.where }),
    db.subscription.groupBy({
      by: ["variantId"],
      where: opts.where,
      _count: { _all: true },
      orderBy: { _count: { variantId: "desc" } },
      take: TOP_PRODUCTS,
    }),
  ]);
  const count = (s: string) => byStatus.find((c) => c.status === s)?._count._all ?? 0;
  const topDetails = await variantDetails(opts.admin, topGroups.map((g) => g.variantId));

  const base = {
    shopName: shop.name,
    title: opts.title,
    periodLabel: opts.periodLabel,
    timeZone: shop.timeZone,
    kpis: {
      newRequests: total,
      pending: count("PENDING"),
      notified: count("NOTIFIED"),
      unsubscribed: count("UNSUBSCRIBED"),
      failed: count("FAILED"),
      revenue: Number(revenue._sum.revenue ?? 0),
    },
    topTitle: opts.topTitle,
    top: topGroups.map((g) => ({ item: oneLine(detailOrUnknown(topDetails, g.variantId)), count: g._count._all })),
    now: opts.now,
  };

  const files: ExportFile[] = [];
  for (const format of opts.formats) {
    // Each file gets its own pass over the rows: a generator can only be read once.
    if (format === "xlsx") {
      const { buffer } = await buildWorkbook({
        ...base,
        rows: requestRows(opts.where, opts.admin, MAX_EXPORT_ROWS),
        ...(total > MAX_EXPORT_ROWS ? { truncatedFrom: total } : {}),
      });
      files.push({ format, filename: `${opts.fileBase}.xlsx`, content: buffer, mime: MIME.xlsx });
    } else {
      const { buffer } = await buildPdf({
        ...base,
        rows: requestRows(opts.where, opts.admin, MAX_PDF_ROWS),
        ...(total > MAX_PDF_ROWS ? { truncatedFrom: total } : {}),
      });
      files.push({ format, filename: `${opts.fileBase}.pdf`, content: buffer, mime: MIME.pdf });
    }
  }
  return { files, total };
}
