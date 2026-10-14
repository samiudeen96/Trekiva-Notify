import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { loadSettings, saveGeneral } from "../settings/settings.server";
import { fieldErrors, generalSchema, type GeneralValues } from "../settings/schema";
import { sendTestEmail } from "../email/test-email.server";
import { env } from "../utils/env.server";

const LOCATIONS_QUERY = `#graphql
  query NotifyLocations {
    shop { name }
    locations(first: 50) { nodes { id name isActive } }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const settings = await loadSettings(session.shop);

  let locations: { id: string; name: string }[] = [];
  try {
    const res = await admin.graphql(LOCATIONS_QUERY);
    const json = (await res.json()) as { data?: { locations: { nodes: { id: string; name: string; isActive: boolean }[] } } };
    locations = (json.data?.locations.nodes ?? []).filter((l) => l.isActive).map((l) => ({ id: l.id, name: l.name }));
  } catch {
    // The locations list is optional: with none shown, every location triggers alerts.
  }

  const values: GeneralValues = {
    enabled: settings.enabled,
    hidePurchaseButtons: settings.hidePurchaseButtons,
    senderEmail: settings.senderEmail,
    replyTo: settings.replyTo,
    enabledLocationIds: settings.enabledLocationIds,
    minStockThreshold: settings.minStockThreshold,
    reportFrequency: settings.reportFrequency,
    reportEmail: settings.reportEmail,
    reportCc: settings.reportCc,
  };
  return { values, locations, defaultFrom: env.EMAIL_FROM ?? "", resendReady: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM) };
};

const bodySchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("save"), values: generalSchema }),
  z.object({ intent: z.literal("test"), to: z.string().trim().toLowerCase().max(254).email() }),
]);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return { kind: "save" as const, ok: false, errors: fieldErrors(parsed.error), message: "" };

  if (parsed.data.intent === "save") {
    await saveGeneral(session.shop, parsed.data.values);
    return { kind: "save" as const, ok: true, errors: {} as Record<string, string>, message: "" };
  }

  const settings = await loadSettings(session.shop);
  let shopName = session.shop;
  try {
    const res = await admin.graphql(`#graphql\n query NotifyShopName { shop { name } }`);
    shopName = ((await res.json()) as { data?: { shop: { name: string } } }).data?.shop.name ?? shopName;
  } catch {
    /* the myshopify domain is a fine fallback name */
  }
  const result = await sendTestEmail({
    to: parsed.data.to,
    shopName,
    emailConfig: settings.editor.email,
    senderEmail: settings.senderEmail,
    replyTo: settings.replyTo,
  });
  return {
    kind: "test" as const,
    ok: result.ok,
    errors: {} as Record<string, string>,
    message: result.ok ? `Test email sent to ${parsed.data.to}.` : result.error,
  };
};

const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
const checked = (e: Event) => (e.currentTarget as HTMLInputElement).checked;
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function Settings() {
  const loaded = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const saveFetcher = useFetcher<typeof action>();
  const testFetcher = useFetcher<typeof action>();

  const [values, setValues] = useState<GeneralValues>(loaded.values);
  const [cc, setCc] = useState(loaded.values.reportCc.join(", "));
  const [testTo, setTestTo] = useState("");
  const [initial] = useState(() => JSON.stringify(loaded.values));
  const [submitted, setSubmitted] = useState(initial);

  const saved = saveFetcher.data?.kind === "save" && saveFetcher.data.ok ? submitted : initial;
  const dirty = useMemo(() => JSON.stringify(values) !== saved, [values, saved]);
  const errors = saveFetcher.data?.kind === "save" && !saveFetcher.data.ok ? saveFetcher.data.errors : {};
  const set = (p: Partial<GeneralValues>) => setValues((v) => ({ ...v, ...p }));

  useEffect(() => {
    if (saveFetcher.data?.ok) void shopify.toast.show("Saved");
  }, [saveFetcher.data, shopify]);
  useEffect(() => {
    if (testFetcher.data?.message) void shopify.toast.show(testFetcher.data.message, { isError: !testFetcher.data.ok });
  }, [testFetcher.data, shopify]);

  const save = () => {
    setSubmitted(JSON.stringify(values));
    saveFetcher.submit({ intent: "save", values } as unknown as Record<string, never>, { method: "post", encType: "application/json" });
  };
  const sendTest = () =>
    testFetcher.submit({ intent: "test", to: testTo } as unknown as Record<string, never>, { method: "post", encType: "application/json" });

  const toggleLocation = (id: string, on: boolean) =>
    set({ enabledLocationIds: on ? [...values.enabledLocationIds.filter((x) => x !== id), id] : values.enabledLocationIds.filter((x) => x !== id) });

  return (
    <s-page heading="Settings">
      <s-button slot="primary-action" variant="primary" onClick={save}
        {...(saveFetcher.state !== "idle" ? { loading: true } : {})} {...(dirty ? {} : { disabled: true })}>
        Save
      </s-button>

      <s-section heading="Sender">
        <s-stack gap="base">
          {!loaded.resendReady && (
            <s-banner tone="warning" heading="Resend is not configured">
              Set RESEND_API_KEY and EMAIL_FROM on the server. Restock emails stay queued until then.
            </s-banner>
          )}
          <s-paragraph>
            From name and email used on restock notifications. The sending domain is verified once in Resend
            {loaded.defaultFrom ? ` (currently ${loaded.defaultFrom}).` : "."} A from email here must be on that same domain.
          </s-paragraph>
          <s-email-field label="From email (optional)" value={values.senderEmail} error={errors.senderEmail}
            placeholder="notify@yourdomain.com" onInput={(e: Event) => set({ senderEmail: val(e) })} />
          <s-email-field label="Reply-to email (optional)" value={values.replyTo} error={errors.replyTo}
            onInput={(e: Event) => set({ replyTo: val(e) })} />
          <s-stack direction="inline" gap="small-200" alignItems="end">
            <s-email-field label="Send a test email to" value={testTo} onInput={(e: Event) => setTestTo(val(e))} />
            <s-button onClick={sendTest} {...(testFetcher.state !== "idle" ? { loading: true } : {})} {...(testTo ? {} : { disabled: true })}>
              Send test
            </s-button>
          </s-stack>
          <s-text color="subdued">The test uses your saved email design. Save changes in the editor first.</s-text>
        </s-stack>
      </s-section>

      <s-section heading="Storefront">
        <s-stack gap="base">
          <s-paragraph>Control the Notify me button on your store.</s-paragraph>
          <s-switch label="Back in stock alert" checked={values.enabled} onChange={(e: Event) => set({ enabled: checked(e) })} />
          <s-switch label="Hide Add to cart and Buy it now when a variant is sold out"
            checked={values.hidePurchaseButtons} onChange={(e: Event) => set({ hidePurchaseButtons: checked(e) })} />
        </s-stack>
      </s-section>

      <s-section heading="Location-based alerts">
        <s-stack gap="small-200">
          <s-paragraph>Send back in stock email when items restock at selected locations. With none selected, every location counts.</s-paragraph>
          {loaded.locations.map((l) => (
            <s-checkbox key={l.id} label={l.name} checked={values.enabledLocationIds.includes(l.id)}
              onChange={(e: Event) => toggleLocation(l.id, checked(e))} />
          ))}
          {errors.enabledLocationIds && <s-text color="subdued">{errors.enabledLocationIds}</s-text>}
        </s-stack>
      </s-section>

      <s-section heading="Email delivery settings">
        <s-number-field label="Customers will be notified when stock is equal to or greater than this number"
          min={1} value={String(values.minStockThreshold)} error={errors.minStockThreshold}
          onInput={(e: Event) => set({ minStockThreshold: Math.max(1, Math.round(Number(val(e)) || 1)) })} />
      </s-section>

      <s-section heading="Notify me request alerts">
        <s-stack gap="base">
          <s-paragraph>Get a summary of new Notify me requests, so you can track demand and restock at the right time. A report is sent only when requests exist.</s-paragraph>
          <s-choice-list label="Send summary requests in" name="frequency" values={[values.reportFrequency || "NONE"]}
            onChange={(e: Event) => {
              const next = (e.currentTarget as HTMLElement & { values?: string[] }).values?.[0] ?? "NONE";
              set({ reportFrequency: (next === "NONE" ? "" : next) as GeneralValues["reportFrequency"] });
            }}>
            <s-choice value="NONE">No report</s-choice>
            <s-choice value="DAILY">Daily report</s-choice>
            <s-choice value="WEEKLY">Weekly report</s-choice>
            <s-choice value="MONTHLY">Monthly report</s-choice>
          </s-choice-list>
          <s-email-field label="Send to email" value={values.reportEmail} error={errors.reportEmail}
            onInput={(e: Event) => set({ reportEmail: val(e) })} />
          <s-text-field label="CC to emails" details="Separate addresses with commas." value={cc}
            error={Object.entries(errors).find(([k]) => k.startsWith("reportCc"))?.[1]}
            onInput={(e: Event) => { setCc(val(e)); set({ reportCc: list(val(e)) }); }} />
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
