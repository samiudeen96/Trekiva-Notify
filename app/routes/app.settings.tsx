import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { loadSettings, saveGeneral } from "../settings/settings.server";
import { fieldErrors, generalSchema, type GeneralValues } from "../settings/schema";
import { sendTestEmail } from "../email/test-email.server";
import { sendSampleReport } from "../reports/test-report.server";
import { nextReportAt } from "../reports/schedule";
import { SettingsRow } from "../components/ui";
import { addEmails } from "../subscriptions/email";
import { env } from "../utils/env.server";

const LOCATIONS_QUERY = `#graphql
  query NotifyLocations {
    shop { name ianaTimezone }
    locations(first: 50) { nodes { id name isActive } }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const settings = await loadSettings(session.shop);

  let locations: { id: string; name: string }[] = [];
  let timeZone = "UTC";
  try {
    const res = await admin.graphql(LOCATIONS_QUERY);
    const json = (await res.json()) as {
      data?: { shop: { ianaTimezone: string }; locations: { nodes: { id: string; name: string; isActive: boolean }[] } };
    };
    timeZone = json.data?.shop.ianaTimezone ?? timeZone;
    locations = (json.data?.locations.nodes ?? []).filter((l) => l.isActive).map((l) => ({ id: l.id, name: l.name }));
  } catch {
    // The locations list is optional: with none shown, every location triggers alerts.
  }

  const values: GeneralValues = {
    enabled: settings.enabled,
    senderEmail: settings.senderEmail,
    replyTo: settings.replyTo,
    enabledLocationIds: settings.enabledLocationIds,
    minStockThreshold: settings.minStockThreshold,
    reportFrequency: settings.reportFrequency,
    reportHour: settings.reportHour,
    reportWeekday: settings.reportWeekday,
    reportMonthDay: settings.reportMonthDay,
    reportEmail: settings.reportEmail,
    reportCc: settings.reportCc,
  };
  const embedUrl = `https://${session.shop}/admin/themes/current/editor?context=apps&activateAppId=${env.SHOPIFY_API_KEY}/notify-embed`;
  return { values, locations, timeZone, embedUrl, defaultFrom: env.EMAIL_FROM ?? "", resendReady: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM) };
};

const bodySchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("save"), values: generalSchema }),
  z.object({ intent: z.literal("test"), to: z.string().trim().toLowerCase().max(254).email() }),
  z.object({ intent: z.literal("sampleReport") }),
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
  if (parsed.data.intent === "sampleReport" && !settings.reportEmail) {
    return { kind: "test" as const, ok: false, errors: {} as Record<string, string>, message: "Save a Send to email first." };
  }
  try {
    const res = await admin.graphql(`#graphql\n query NotifyShopName { shop { name } }`);
    shopName = ((await res.json()) as { data?: { shop: { name: string } } }).data?.shop.name ?? shopName;
  } catch {
    /* the myshopify domain is a fine fallback name */
  }
  if (parsed.data.intent === "sampleReport") {
    const sample = await sendSampleReport({
      to: settings.reportEmail,
      cc: settings.reportCc,
      shopName,
      frequency: settings.reportFrequency || "WEEKLY",
      senderEmail: settings.senderEmail,
      adminUrl: `https://${session.shop}/admin/apps`,
    });
    return {
      kind: "test" as const,
      ok: sample.ok,
      errors: {} as Record<string, string>,
      message: sample.ok ? `Sample report sent to ${settings.reportEmail}.` : sample.error,
    };
  }
  const result = await sendTestEmail({
    to: (parsed.data as { to: string }).to,
    shopName,
    emailConfig: settings.editor.email,
    senderEmail: settings.senderEmail,
    replyTo: settings.replyTo,
  });
  return {
    kind: "test" as const,
    ok: result.ok,
    errors: {} as Record<string, string>,
    message: result.ok ? `Test email sent to ${(parsed.data as { to: string }).to}.` : result.error,
  };
};

const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
const checked = (e: Event) => (e.currentTarget as HTMLInputElement).checked;
const MAX_CC = 10;

const WEEKDAYS: [number, string][] = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;

// The current minute, or 0 while rendering on the server: the "next report" line only appears in the browser.
const minuteNow = () => Math.floor(Date.now() / 60_000);
const subscribeNone = () => () => {};

export default function Settings() {
  const loaded = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const saveFetcher = useFetcher<typeof action>();
  const testFetcher = useFetcher<typeof action>();

  const [values, setValues] = useState<GeneralValues>(loaded.values);
  const nowMinute = useSyncExternalStore(subscribeNone, minuteNow, () => 0);
  const [ccInput, setCcInput] = useState("");
  const [ccError, setCcError] = useState<string | null>(null);
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

  // Adds whatever is typed in the CC box (one address or a pasted list) as chips.
  const addCc = () => {
    if (!ccInput.trim()) return;
    const r = addEmails(values.reportCc, ccInput, MAX_CC);
    set({ reportCc: r.list });
    if (r.invalid.length) {
      // Keep the bad ones in the box so they can be fixed instead of retyped.
      setCcInput(r.invalid.join(", "));
      setCcError(`Not a valid email: ${r.invalid.join(", ")}`);
    } else if (r.overflow.length) {
      setCcInput("");
      setCcError(`You can add up to ${MAX_CC} CC addresses.`);
    } else {
      setCcInput("");
      setCcError(null);
    }
  };
  const removeCc = (email: string) => set({ reportCc: values.reportCc.filter((x) => x !== email) });

  const save = () => {
    setSubmitted(JSON.stringify(values));
    saveFetcher.submit({ intent: "save", values } as unknown as Record<string, never>, { method: "post", encType: "application/json" });
  };
  const sendTest = () =>
    testFetcher.submit({ intent: "test", to: testTo } as unknown as Record<string, never>, { method: "post", encType: "application/json" });

  // When the next report goes out, in the store's time zone, from what is currently selected.
  const nextReport = useMemo(() => {
    if (!values.reportFrequency || !nowMinute) return null;
    const at = nextReportAt({
      frequency: values.reportFrequency,
      hour: values.reportHour,
      weekday: values.reportWeekday,
      monthDay: values.reportMonthDay,
      now: new Date(nowMinute * 60_000),
      timeZone: loaded.timeZone,
    });
    return at
      ? new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: loaded.timeZone }).format(at)
      : null;
  }, [values.reportFrequency, values.reportHour, values.reportWeekday, values.reportMonthDay, nowMinute, loaded.timeZone]);
  const sendSample = () =>
    testFetcher.submit({ intent: "sampleReport" } as unknown as Record<string, never>, { method: "post", encType: "application/json" });

  const toggleLocation = (id: string, on: boolean) =>
    set({ enabledLocationIds: on ? [...values.enabledLocationIds.filter((x) => x !== id), id] : values.enabledLocationIds.filter((x) => x !== id) });

  return (
    <s-page heading="Settings">
      <s-button slot="primary-action" variant="primary" onClick={save}
        {...(saveFetcher.state !== "idle" ? { loading: true } : {})} {...(dirty ? {} : { disabled: true })}>
        Save
      </s-button>

      {!loaded.resendReady && (
        <s-banner tone="warning" heading="Email sending is not set up">
          Set RESEND_API_KEY and EMAIL_FROM on the server. Restock emails stay queued until then.
        </s-banner>
      )}

      <s-section>
        <SettingsRow
          title="Sender"
          description={`From name and email used on restock notifications. The sending domain is verified once in Resend${loaded.defaultFrom ? ` (currently ${loaded.defaultFrom})` : ""}; a from email here must be on that same domain.`}
        >
          <s-email-field autocomplete="off" name="notify-from-address" label="From email (optional)" value={values.senderEmail}
            error={errors.senderEmail} placeholder="notify@yourdomain.com"
            onInput={(e: Event) => set({ senderEmail: val(e) })} />
          <s-email-field autocomplete="off" name="notify-reply-to-address" label="Reply-to email (optional)" value={values.replyTo}
            error={errors.replyTo} details="Where customer replies go."
            onInput={(e: Event) => set({ replyTo: val(e) })} />
          <s-grid gridTemplateColumns="1fr auto" gap="small-200" alignItems="end">
            <s-email-field autocomplete="off" name="notify-test-recipient" label="Send a test email to" value={testTo}
              onInput={(e: Event) => setTestTo(val(e))} />
            <s-button onClick={sendTest} {...(testFetcher.state !== "idle" ? { loading: true } : {})} {...(testTo ? {} : { disabled: true })}>
              Send test
            </s-button>
          </s-grid>
          <s-text color="subdued">The test uses your saved email design. Save changes in the editor first.</s-text>
        </SettingsRow>
        <s-divider />

        <SettingsRow title="Storefront" description="Control the Notify me button on your store.">
          <s-switch label="Back in stock alert" details="Show the Notify me button and send restock emails."
            checked={values.enabled} onChange={(e: Event) => set({ enabled: checked(e) })} />
          <s-text color="subdued">
            Hiding Add to cart and Buy it now on a sold-out variant is set in your theme, so it applies before the page
            finishes loading: <s-link href={loaded.embedUrl} target="_blank">open the app embed settings</s-link>.
          </s-text>
        </SettingsRow>
        <s-divider />

        <SettingsRow title="Location-based alerts"
          description="Send back in stock email when items restock at selected locations. With none selected, every location counts.">
          {loaded.locations.length === 0 && <s-text color="subdued">No locations found.</s-text>}
          {loaded.locations.map((l) => (
            <s-checkbox key={l.id} label={l.name} checked={values.enabledLocationIds.includes(l.id)}
              onChange={(e: Event) => toggleLocation(l.id, checked(e))} />
          ))}
          {errors.enabledLocationIds && <s-text color="subdued">{errors.enabledLocationIds}</s-text>}
        </SettingsRow>
        <s-divider />

        <SettingsRow title="Email delivery" description="Set the logic that controls when emails go out.">
          <s-number-field label="Notify when stock is equal to or greater than" min={1} value={String(values.minStockThreshold)}
            error={errors.minStockThreshold} details="Customers are emailed once available stock reaches this number."
            onInput={(e: Event) => set({ minStockThreshold: Math.max(1, Math.round(Number(val(e)) || 1)) })} />
        </SettingsRow>
        <s-divider />

        <SettingsRow title="Notify me request alerts"
          description="Get a summary of new requests so you can track demand and restock at the right time. Choose how often and when it arrives. A report is sent only when there are new requests.">
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
          {values.reportFrequency && (
            <s-box padding="base" border="base" borderRadius="base" background="subdued">
              <s-stack gap="base">
                <s-grid gridTemplateColumns={`@container (inline-size <= 480px) 1fr, ${values.reportFrequency === "DAILY" ? "1fr" : "1fr 1fr"}`} gap="small-200">
                  {values.reportFrequency === "WEEKLY" && (
                    <s-select label="Day of the week" value={String(values.reportWeekday)}
                      onChange={(e: Event) => set({ reportWeekday: Number((e.currentTarget as HTMLSelectElement).value) })}>
                      {WEEKDAYS.map(([d, name]) => <s-option key={d} value={String(d)}>{name}</s-option>)}
                    </s-select>
                  )}
                  {values.reportFrequency === "MONTHLY" && (
                    <s-select label="Day of the month" value={String(values.reportMonthDay)}
                      onChange={(e: Event) => set({ reportMonthDay: Number((e.currentTarget as HTMLSelectElement).value) })}>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <s-option key={d} value={String(d)}>{ordinal(d)}</s-option>)}
                    </s-select>
                  )}
                  <s-select label="Time" value={String(values.reportHour)}
                    onChange={(e: Event) => set({ reportHour: Number((e.currentTarget as HTMLSelectElement).value) })}>
                    {Array.from({ length: 24 }, (_, h) => h).map((h) => <s-option key={h} value={String(h)}>{hourLabel(h)}</s-option>)}
                  </s-select>
                </s-grid>
                <s-text color="subdued">
                  {nextReport ? `Next report: ${nextReport}` : "Next report: shown once the page has loaded"} ({loaded.timeZone}, your store&apos;s time zone).
                </s-text>
              </s-stack>
            </s-box>
          )}
          <s-email-field autocomplete="off" name="notify-report-recipient" label="Send to email" value={values.reportEmail}
            error={errors.reportEmail} onInput={(e: Event) => set({ reportEmail: val(e) })} />
          <s-stack gap="small-200">
            {/* Enter in the box adds the address; keydown bubbles out of the field to this wrapper. */}
            <div role="presentation" onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); addCc(); } }}>
            <s-grid gridTemplateColumns="1fr auto" gap="small-200" alignItems="end">
              <s-text-field autocomplete="off" name="notify-report-cc" label="CC to emails" placeholder="name@example.com"
                value={ccInput} error={ccError ?? Object.entries(errors).find(([k]) => k.startsWith("reportCc"))?.[1]}
                onInput={(e: Event) => { setCcInput(val(e)); setCcError(null); }} />
              <s-button onClick={addCc} {...(ccInput.trim() ? {} : { disabled: true })}>Add</s-button>
            </s-grid>
            </div>
            <s-text color="subdued">Press Enter or Add. You can paste several, separated by commas. Up to {MAX_CC}.</s-text>
            {values.reportCc.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {values.reportCc.map((email) => (
                  <span key={email} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f1f1f1", borderRadius: 8, padding: "4px 6px 4px 10px", fontSize: 13 }}>
                    {email}
                    <button type="button" aria-label={`Remove ${email}`} onClick={() => removeCc(email)}
                      style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "#6d7175", padding: "0 4px" }}>
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </s-stack>
          {values.reportFrequency && (
            <div>
              <s-button onClick={sendSample} {...(testFetcher.state !== "idle" ? { loading: true } : {})}
                {...(values.reportEmail && !dirty ? {} : { disabled: true })}>
                Send a sample report
              </s-button>
              <div style={{ paddingTop: 6 }}>
                <s-text color="subdued">Sends example numbers to your Send to address (and CC). Save your changes first.</s-text>
              </div>
            </div>
          )}
        </SettingsRow>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
