import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { loadSettings, setFlags } from "../settings/settings.server";
import { variantLabels } from "../shopify/labels.server";
import { ActionCard, Avatar, EmptyState, StatGrid, StatTile, StatusBadge, type SubStatus } from "../components/ui";
import { money, percent, timeAgo } from "../utils/format";

const PAGE_LABEL: Record<string, string> = { product: "Product pages", collection: "Collections", search: "Search", home: "Home page" };
const RULE_LABEL: Record<string, string> = {
  ALL: "all sold-out products",
  EXCLUDE_PRODUCTS: "all except chosen products",
  EXCLUDE_TAGS: "all except tagged products",
  SPECIFIC: "chosen products only",
  COLLECTIONS: "chosen collections only",
  TAGS: "tagged products only",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const [settings, pending, notified, converted, revenue, recent] = await Promise.all([
    loadSettings(shop),
    db.subscription.count({ where: { shopDomain: shop, status: "PENDING" } }),
    db.subscription.count({ where: { shopDomain: shop, status: "NOTIFIED" } }),
    db.subscription.count({ where: { shopDomain: shop, revenue: { gt: 0 } } }),
    db.subscription.aggregate({ where: { shopDomain: shop }, _sum: { revenue: true } }),
    db.subscription.findMany({ where: { shopDomain: shop }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const labels = await variantLabels(admin, recent.map((r) => r.variantId));
  const e = settings.editor;

  return {
    enabled: settings.enabled,
    embedActivated: settings.embedActivated,
    pending,
    notified,
    conversion: percent(converted, notified),
    revenue: Number(revenue._sum.revenue ?? 0),
    summaries: {
      button: `"${e.button.text}" on ${e.showOn.map((p) => PAGE_LABEL[p] ?? p).join(", ") || "no pages"}, for ${RULE_LABEL[e.productRule.mode]}.`,
      form: `"${e.form.header}". Marketing opt-in is ${e.form.marketingOptIn ? "on" : "off"}.`,
      email: `Subject "${e.email.subject}", sent as ${e.email.senderName || "your store name"}.`,
    },
    recent: recent.map((r) => ({
      id: r.id,
      email: r.email,
      item: labels[r.variantId] ?? `Variant ${r.variantId.split("/").pop()}`,
      status: r.status as SubStatus,
      at: r.createdAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get("intent") === "toggle") await setFlags(session.shop, { enabled: form.get("enabled") === "true" });
  return { ok: true };
};

export default function NotifyMe() {
  const d = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  // The switch reflects what is being saved, not the stale loader value, while the request runs.
  const on = fetcher.formData ? fetcher.formData.get("enabled") === "true" : d.enabled;

  return (
    <s-page heading="Back in stock alert">
      <s-button slot="primary-action" variant="primary" href="/app/editor">Edit alert</s-button>
      <s-button slot="secondary-actions" href="/app/subscribers">View all requests</s-button>

      {!d.embedActivated && (
        <s-banner tone="warning" heading="Finish setup">
          The Notify me button only appears once the app embed is on in your theme.{" "}
          <s-link href="/app">Open the setup guide</s-link>
        </s-banner>
      )}

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
          <s-stack gap="small-300">
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-heading>Back in stock alert</s-heading>
              <s-badge tone={on ? "success" : "neutral"}>{on ? "Active" : "Off"}</s-badge>
            </s-stack>
            <s-text color="subdued">
              {on
                ? "Customers see a Notify me button on sold-out products and get an email when stock returns."
                : "Turned off: the button is hidden and no emails are sent for new restocks."}
            </s-text>
          </s-stack>
          <s-switch
            label="Back in stock alert"
            labelAccessibilityVisibility="exclusive"
            checked={on}
            onChange={(e: Event) =>
              fetcher.submit({ intent: "toggle", enabled: String((e.currentTarget as HTMLInputElement).checked) }, { method: "post" })
            }
          />
        </s-stack>
      </s-section>

      <s-section heading="Personalize notify me flow">
        <s-grid gridTemplateColumns="@container (inline-size <= 720px) 1fr, 1fr 1fr 1fr" gap="base">
          <ActionCard icon="cart" tone="success" title="Notify me button" summary={d.summaries.button} href="/app/editor?tab=button" />
          <ActionCard icon="chat" tone="info" title="Signup form" summary={d.summaries.form} href="/app/editor?tab=form" />
          <ActionCard icon="email" tone="warning" title="Notification email" summary={d.summaries.email} href="/app/editor?tab=email" />
        </s-grid>
      </s-section>

      <s-section heading="Performance">
        <StatGrid>
          <StatTile tone="info" label="Pending requests" value={d.pending} hint="Waiting for stock" />
          <StatTile tone="warning" label="Notified requests" value={d.notified} hint="Emails sent" />
          <StatTile tone="neutral" label="Conversion" value={d.conversion} hint="Notified customers who ordered" />
          <StatTile tone="success" label="Revenue converted" value={money(d.revenue)} hint="From restock emails" />
        </StatGrid>
      </s-section>

      <s-section heading="Latest requests">
        {d.recent.length === 0 ? (
          <EmptyState
            title="No requests yet"
            description="When a customer taps Notify me on a sold-out product, it appears here."
          />
        ) : (
          <div>
            {d.recent.map((r, i) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? "1px solid #f1f1f1" : "none" }}>
                <Avatar name={r.email} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}</div>
                  <s-text color="subdued">{r.item}</s-text>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
                  <s-text color="subdued">{timeAgo(r.at)}</s-text>
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}
            <div style={{ paddingTop: 8 }}><s-link href="/app/subscribers">See all requests</s-link></div>
          </div>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
