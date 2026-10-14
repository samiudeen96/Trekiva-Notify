import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { loadSettings, setFlags } from "../settings/settings.server";
import { variantLabels } from "../shopify/labels.server";
import { env } from "../utils/env.server";
import { Avatar, EmptyState, ProgressBar, StatGrid, StatTile, Step } from "../components/ui";
import { money, percent } from "../utils/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const since = new Date(Date.now() - 7 * 86_400_000);

  const [settings, pending, notified, revenue, newThisWeek, demand] = await Promise.all([
    loadSettings(shop),
    db.subscription.count({ where: { shopDomain: shop, status: "PENDING" } }),
    db.subscription.count({ where: { shopDomain: shop, status: "NOTIFIED" } }),
    db.subscription.aggregate({ where: { shopDomain: shop }, _sum: { revenue: true } }),
    db.subscription.count({ where: { shopDomain: shop, createdAt: { gte: since } } }),
    // What customers are waiting for the most: the products worth restocking first.
    db.subscription.groupBy({
      by: ["variantId"],
      where: { shopDomain: shop, status: "PENDING" },
      _count: { _all: true },
      orderBy: { _count: { variantId: "desc" } },
      take: 5,
    }),
  ]);

  const labels = await variantLabels(admin, demand.map((d) => d.variantId));
  return {
    shop,
    apiKey: env.SHOPIFY_API_KEY,
    pending,
    notified,
    newThisWeek,
    revenue: Number(revenue._sum.revenue ?? 0),
    enabled: settings.enabled,
    emailReady: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    steps: {
      embed: settings.embedActivated,
      button: settings.buttonCustomized,
      confirmed: settings.setupConfirmed,
    },
    demand: demand.map((d) => ({
      id: d.variantId,
      item: labels[d.variantId] ?? `Variant ${d.variantId.split("/").pop()}`,
      count: d._count._all,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const intent = String((await request.formData()).get("intent") ?? "");
  if (intent === "embed") await setFlags(session.shop, { embedActivated: true });
  if (intent === "confirm") await setFlags(session.shop, { setupConfirmed: true });
  return { ok: true };
};

export default function Home() {
  const { shop, apiKey, pending, notified, newThisWeek, revenue, enabled, emailReady, steps, demand } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  // Reflect a click straight away instead of waiting for the loader to run again.
  const sent = fetcher.formData?.get("intent");
  const embed = steps.embed || sent === "embed";
  const confirmed = steps.confirmed || sent === "confirm";
  const done = [embed, steps.button, confirmed].filter(Boolean).length;
  const embedUrl = `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${apiKey}/notify-embed`;

  return (
    <s-page heading={`Welcome ${shop.replace(".myshopify.com", "")}`}>
      <s-button slot="primary-action" variant="primary" href="/app/editor">Customize alerts</s-button>
      <s-button slot="secondary-actions" href="/app/subscribers">View subscribers</s-button>

      {!emailReady && (
        <s-banner tone="warning" heading="Email sending is not set up">
          Restock emails stay queued until RESEND_API_KEY and EMAIL_FROM are set on the server.
        </s-banner>
      )}

      {!enabled && (
        <s-banner tone="info" heading="Back in stock alerts are off">
          Customers will not see the Notify me button. <s-link href="/app/notify-me">Turn it on</s-link>
        </s-banner>
      )}

      <div
        style={{
          borderRadius: 12,
          padding: "24px 28px",
          color: "#fff",
          background: "linear-gradient(135deg, #1f2937 0%, #111827 55%, #064e3b 100%)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ maxWidth: 440 }}>
          <div style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 }}>Trekiva Notify</div>
          <div style={{ fontSize: 22, fontWeight: 650, margin: "6px 0 6px" }}>Turn sold out into sold later</div>
          <div style={{ fontSize: 14, opacity: 0.8, lineHeight: 1.5 }}>
            Customers join a waitlist on sold-out products. The moment stock returns, they get an email with the exact item.
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>Revenue from restock emails</div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25 }}>{money(revenue)}</div>
          <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>{notified} customers notified</div>
        </div>
      </div>

      {done < 3 && (
        <s-section heading="Setup guide">
          <s-stack gap="base">
            <s-text color="subdued">{done} of 3 steps completed. Finish them to start sending back in stock alerts.</s-text>
            <ProgressBar value={done} max={3} />
            <div>
              <Step n={1} done={embed} title="Activate the app embed in your theme" description="Shows the Notify me button on your store.">
                <s-link href={embedUrl} target="_blank">Open theme editor</s-link>
                <s-button onClick={() => fetcher.submit({ intent: "embed" }, { method: "post" })}>I turned it on</s-button>
              </Step>
              <Step n={2} done={steps.button} title="Customize the notify me button" description="Choose the text, colors and pages.">
                <s-button href="/app/editor">Customize</s-button>
              </Step>
              <Step n={3} done={confirmed} title="Confirm your flow is working" description="Sell out a test variant, sign up, then restock it.">
                <s-button onClick={() => fetcher.submit({ intent: "confirm" }, { method: "post" })}>Everything is great</s-button>
              </Step>
            </div>
          </s-stack>
        </s-section>
      )}

      <s-section heading="Overview">
        <StatGrid>
          <StatTile tone="success" label="Notify me revenue" value={money(revenue)} hint="Orders from restock emails" href="/app/notify-me" />
          <StatTile tone="info" label="Pending" value={pending} hint="Waiting for stock" href="/app/subscribers?status=PENDING" />
          <StatTile tone="warning" label="Notified" value={notified} hint={`${percent(notified, pending + notified)} of all requests`} href="/app/subscribers?status=NOTIFIED" />
          <StatTile tone="neutral" label="New this week" value={newThisWeek} hint="Last 7 days" href="/app/subscribers" />
        </StatGrid>
      </s-section>

      <s-section heading="Most wanted right now">
        {demand.length === 0 ? (
          <EmptyState
            title="No one is waiting yet"
            description="When a customer taps Notify me on a sold-out product, it shows up here so you can see what to restock first."
          />
        ) : (
          <div>
            {demand.map((d, i) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? "1px solid #f1f1f1" : "none" }}>
                <Avatar name={String(i + 1)} />
                <div style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{d.item}</div>
                <s-badge tone="info">{d.count} waiting</s-badge>
              </div>
            ))}
            <div style={{ paddingTop: 8 }}><s-link href="/app/subscribers?status=PENDING">See all pending requests</s-link></div>
          </div>
        )}
      </s-section>

      <s-section heading="Notify Me">
        <s-stack gap="base">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge tone={enabled ? "success" : "neutral"}>{enabled ? "Active" : "Off"}</s-badge>
          </s-stack>
          <s-paragraph>Collect waitlists and send back in stock emails automatically.</s-paragraph>
          <s-stack direction="inline" gap="small-200">
            <s-button href="/app/notify-me">Manage alert</s-button>
            <s-button href="/app/settings">Settings</s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
