import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { variantLabels } from "../shopify/labels.server";

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
  const [rows, total] = await Promise.all([
    db.subscription.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.subscription.count({ where }),
  ]);
  const labels = await variantLabels(admin, rows.map((r) => r.variantId));

  return {
    page,
    q,
    status: status ?? "",
    total,
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

const TONES: Record<Status, "success" | "info" | "neutral" | "critical"> = {
  PENDING: "info",
  NOTIFIED: "success",
  UNSUBSCRIBED: "neutral",
  FAILED: "critical",
};
const LABELS: Record<Status, string> = { PENDING: "Pending", NOTIFIED: "Notified", UNSUBSCRIBED: "Unsubscribed", FAILED: "Failed" };

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function Subscribers() {
  const { rows, page, pages, total, q, status } = useLoaderData<typeof loader>();
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
      <s-section padding="none">
        <s-box padding="base">
          <s-select
            label="Status"
            labelAccessibilityVisibility="exclusive"
            value={status}
            onChange={(e: Event) => go(1, { status: (e.currentTarget as HTMLSelectElement).value })}
          >
            <s-option value="">All statuses</s-option>
            {STATUSES.map((s) => <s-option key={s} value={s}>{LABELS[s]}</s-option>)}
          </s-select>
        </s-box>
        <s-table
          variant="auto"
          paginate
          hasPreviousPage={page > 1}
          hasNextPage={page < pages}
          onPreviousPage={() => go(page - 1)}
          onNextPage={() => go(page + 1)}
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
                <s-table-cell>{r.email}</s-table-cell>
                <s-table-cell>{r.item}</s-table-cell>
                <s-table-cell><s-badge tone={TONES[r.status as Status]}>{LABELS[r.status as Status]}</s-badge></s-table-cell>
                <s-table-cell>{when(r.createdAt)}</s-table-cell>
                <s-table-cell>{r.notifiedAt ? when(r.notifiedAt) : "-"}</s-table-cell>
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
          <s-box padding="large">
            <s-text>{q || status ? "No requests match your search or filters." : "No requests yet."}</s-text>
          </s-box>
        )}
        <s-box padding="base"><s-text color="subdued">{total} request{total === 1 ? "" : "s"}</s-text></s-box>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
