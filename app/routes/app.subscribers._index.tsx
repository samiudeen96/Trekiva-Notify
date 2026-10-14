import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { variantLabels } from "../shopify/labels.server";
import { Avatar, EmptyState, STATUS_LABEL, StatGrid, StatTile, StatusBadge } from "../components/ui";
import { timeAgo } from "../utils/format";

const PAGE_SIZE = 25;
const STATUSES = ["PENDING", "NOTIFIED", "UNSUBSCRIBED", "FAILED"] as const;
type Status = (typeof STATUSES)[number];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const statusParam = url.searchParams.get("status") ?? "";
  // An unknown value from the address bar is ignored, never passed to the query.
  const status = (STATUSES as readonly string[]).includes(statusParam) ? (statusParam as Status) : undefined;

  const where = {
    shopDomain: session.shop,
    ...(status ? { status } : {}),
    ...(q ? { emailNormalized: { contains: q } } : {}),
  };
  const [rows, total, byStatus] = await Promise.all([
    db.subscription.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.subscription.count({ where }),
    // Whole-shop counts for the tiles: they ignore the search and filter on purpose.
    db.subscription.groupBy({ by: ["status"], where: { shopDomain: session.shop }, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(byStatus.map((c) => [c.status, c._count._all])) as Partial<Record<Status, number>>;
  const labels = await variantLabels(admin, rows.map((r) => r.variantId));

  return {
    page,
    q,
    status: status ?? "",
    total,
    counts,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      item: labels[r.variantId] ?? `Variant ${r.variantId.split("/").pop()}`,
      status: r.status,
      pageType: r.pageType ?? "",
      marketing: r.marketingOptIn,
      createdAt: r.createdAt.toISOString(),
      notifiedAt: r.notifiedAt?.toISOString() ?? null,
      revenue: r.revenue ? Number(r.revenue) : 0,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get("intent") !== "delete") return { deleted: false };
  // Scoped to the shop: an id from another store deletes nothing.
  const { count } = await db.subscription.deleteMany({
    where: { id: String(form.get("id") ?? ""), shopDomain: session.shop },
  });
  return { deleted: count > 0 };
};

export default function Subscribers() {
  const { rows, page, pages, total, q, status, counts } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const busy = useNavigation().state !== "idle";

  // Each control keeps the others' values, so changing one filter never drops the rest.
  const go = (p: number, next: { q?: string; status?: string } = {}) => {
    const v = { q, status, ...next };
    navigate(`/app/subscribers?${new URLSearchParams({ ...(v.q ? { q: v.q } : {}), ...(v.status ? { status: v.status } : {}), page: String(p) })}`);
  };

  const exportCsv = async () => {
    const res = await fetch("/app/subscribers/export");
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "trekiva-notify-subscribers.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <s-page heading="Subscribers">
      <s-button slot="secondary-actions" onClick={() => void exportCsv()}>Export CSV</s-button>
      <s-section>
        <StatGrid>
          <StatTile tone="info" label="Pending" value={counts.PENDING ?? 0} hint="Waiting for stock" href="/app/subscribers?status=PENDING" />
          <StatTile tone="success" label="Notified" value={counts.NOTIFIED ?? 0} hint="Email sent" href="/app/subscribers?status=NOTIFIED" />
          <StatTile tone="neutral" label="Unsubscribed" value={counts.UNSUBSCRIBED ?? 0} hint="Opted out or bounced" href="/app/subscribers?status=UNSUBSCRIBED" />
          <StatTile tone="critical" label="Failed" value={counts.FAILED ?? 0} hint="Could not be emailed" href="/app/subscribers?status=FAILED" />
        </StatGrid>
      </s-section>
      <s-section padding="none">
        <s-box padding="base">
          <s-select
            label="Status"
            labelAccessibilityVisibility="exclusive"
            value={status}
            onChange={(e: Event) => go(1, { status: (e.currentTarget as HTMLSelectElement).value })}
          >
            <s-option value="">All statuses</s-option>
            {STATUSES.map((s) => <s-option key={s} value={s}>{STATUS_LABEL[s]}</s-option>)}
          </s-select>
        </s-box>
        <s-table
          variant="auto"
          {...(pages > 1
            ? { paginate: true, hasPreviousPage: page > 1, hasNextPage: page < pages, onPreviousPage: () => go(page - 1), onNextPage: () => go(page + 1) }
            : {})}
          {...(busy ? { loading: true } : {})}
        >
          <s-search-field
            slot="filters"
            label="Search subscribers"
            labelAccessibilityVisibility="exclusive"
            placeholder="Search by email"
            value={q}
            onChange={(e: Event) => go(1, { q: (e.currentTarget as HTMLInputElement).value.trim() })}
          />
          <s-table-header-row>
            <s-table-header listSlot="primary">Email</s-table-header>
            <s-table-header listSlot="secondary">Product</s-table-header>
            <s-table-header listSlot="inline">Status</s-table-header>
            <s-table-header>Requested</s-table-header>
            <s-table-header>Notified</s-table-header>
            <s-table-header>Page</s-table-header>
            <s-table-header>Marketing</s-table-header>
            <s-table-header>Actions</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rows.map((r) => (
              <s-table-row key={r.id}>
                <s-table-cell>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={r.email} />
                    <span style={{ fontWeight: 600 }}>{r.email}</span>
                  </div>
                </s-table-cell>
                <s-table-cell>{r.item}</s-table-cell>
                <s-table-cell><StatusBadge status={r.status as Status} /></s-table-cell>
                <s-table-cell>{timeAgo(r.createdAt)}</s-table-cell>
                <s-table-cell>{r.notifiedAt ? timeAgo(r.notifiedAt) : "-"}</s-table-cell>
                <s-table-cell>{r.pageType || "-"}</s-table-cell>
                <s-table-cell>{r.marketing ? "Yes" : "No"}</s-table-cell>
                <s-table-cell>
                  <s-button tone="critical" variant="tertiary"
                    onClick={() => { if (window.confirm(`Delete the request from ${r.email}?`)) submit({ intent: "delete", id: r.id }, { method: "post" }); }}>
                    Delete
                  </s-button>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
        {rows.length === 0 && (
          <EmptyState
            title={q || status ? "No matching requests" : "No requests yet"}
            description={
              q || status
                ? "Try a different search or clear the status filter."
                : "When a customer taps Notify me on a sold-out product, the request shows up here."
            }
            {...(q || status ? { actionLabel: "Clear filters", actionHref: "/app/subscribers" } : {})}
          />
        )}
        <s-box padding="base"><s-text color="subdued">{total} request{total === 1 ? "" : "s"}</s-text></s-box>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
