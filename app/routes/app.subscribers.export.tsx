import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { csvRow } from "../subscriptions/csv";

const MAX_ROWS = 50_000;

// Fetched with the session token (App Bridge), then saved by the page: see app.subscribers._index.tsx.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const rows = await db.subscription.findMany({
    where: { shopDomain: session.shop },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  const lines = [
    csvRow(["email", "status", "product_id", "variant_id", "page", "marketing_opt_in", "requested_at", "notified_at", "revenue"]),
    ...rows.map((r) =>
      csvRow([
        r.email,
        r.status,
        r.productId.split("/").pop(),
        r.variantId.split("/").pop(),
        r.pageType,
        r.marketingOptIn,
        r.createdAt.toISOString(),
        r.notifiedAt?.toISOString(),
        r.revenue ? r.revenue.toString() : "",
      ]),
    ),
  ];
  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="trekiva-notify-subscribers.csv"',
      "Cache-Control": "no-store",
    },
  });
};
