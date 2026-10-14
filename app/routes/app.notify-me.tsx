import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { loadSettings, setFlags } from "../settings/settings.server";
import { money } from "../utils/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [settings, pending, notified, revenue] = await Promise.all([
    loadSettings(shop),
    db.subscription.count({ where: { shopDomain: shop, status: "PENDING" } }),
    db.subscription.count({ where: { shopDomain: shop, status: "NOTIFIED" } }),
    db.subscription.aggregate({ where: { shopDomain: shop }, _sum: { revenue: true } }),
  ]);
  return { enabled: settings.enabled, pending, notified, revenue: Number(revenue._sum.revenue ?? 0) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get("intent") === "toggle") await setFlags(session.shop, { enabled: form.get("enabled") === "true" });
  return { ok: true };
};

const CARDS = [
  { tab: "button", title: "Customize notify me button", icon: "cart" },
  { tab: "form", title: "Customize signup form", icon: "chat" },
  { tab: "email", title: "Customize notification email", icon: "email" },
] as const;

export default function NotifyMe() {
  const { enabled, pending, notified, revenue } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  // The switch reflects what is being saved, not the stale loader value, while the request runs.
  const on = fetcher.formData ? fetcher.formData.get("enabled") === "true" : enabled;

  return (
    <s-page heading="Back in stock alert">
      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-heading>Back in stock alert</s-heading>
            <s-badge tone={on ? "success" : "neutral"}>{on ? "Active" : "Off"}</s-badge>
          </s-stack>
          <s-switch
            label="Back in stock alert"
            labelAccessibilityVisibility="exclusive"
            checked={on}
            onChange={(e: Event) =>
              fetcher.submit(
                { intent: "toggle", enabled: String((e.currentTarget as HTMLInputElement).checked) },
                { method: "post" },
              )
            }
          />
        </s-stack>
      </s-section>

      <s-section heading="Personalize notify me flow">
        <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
          {CARDS.map((c) => (
            <s-box key={c.tab} padding="base" border="base" borderRadius="base">
              <s-stack gap="base">
                <s-icon type={c.icon} />
                <s-heading>{c.title}</s-heading>
                <s-button href={`/app/editor?tab=${c.tab}`}>Customize</s-button>
              </s-stack>
            </s-box>
          ))}
        </s-grid>
      </s-section>

      <s-section heading="Back in stock alert">
        <s-stack gap="base">
          <s-stack direction="inline" gap="base">
            <s-link href="/app/editor">Edit alert</s-link>
            <s-link href="/app/subscribers">View report</s-link>
          </s-stack>
          <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
            <s-stack gap="small-300"><s-text color="subdued">Pending request</s-text><s-heading>{pending}</s-heading></s-stack>
            <s-stack gap="small-300"><s-text color="subdued">Notified request</s-text><s-heading>{notified}</s-heading></s-stack>
            <s-stack gap="small-300"><s-text color="subdued">Revenue converted</s-text><s-heading>{money(revenue)}</s-heading></s-stack>
          </s-grid>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
