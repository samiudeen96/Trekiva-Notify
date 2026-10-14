import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { loadSettings, saveEditor } from "../settings/settings.server";
import { editorSchema, fieldErrors, SHOW_ON, type EditorValues } from "../settings/schema";
import { DEFAULT_BUTTON, DEFAULT_EMAIL, DEFAULT_FORM } from "../settings/defaults";
import { ButtonPreview, EmailPreview, FormPreview, InboxPreview } from "../components/EditorPreview";

const TABS = [
  { id: "button", label: "Button" },
  { id: "form", label: "Signup Form" },
  { id: "email", label: "Email notification" },
  { id: "settings", label: "Email settings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await loadSettings(session.shop);
  const tab = new URL(request.url).searchParams.get("tab");
  return {
    values: settings.editor as EditorValues,
    tab: (TABS.some((t) => t.id === tab) ? tab : "button") as TabId,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const parsed = editorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return { ok: false as const, errors: fieldErrors(parsed.error) };
  await saveEditor(session.shop, parsed.data);
  return { ok: true as const, errors: {} as Record<string, string> };
};

const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
const checked = (e: Event) => (e.currentTarget as HTMLInputElement).checked;

const PAGE_LABELS: Record<(typeof SHOW_ON)[number], string> = {
  product: "Product page",
  collection: "Collection page",
  search: "Search page",
  home: "Home page",
};

const RULES: { mode: EditorValues["productRule"]["mode"]; label: string }[] = [
  { mode: "ALL", label: "All out of stock products" },
  { mode: "EXCLUDE_PRODUCTS", label: "Exclude products" },
  { mode: "EXCLUDE_TAGS", label: "Exclude tags" },
  { mode: "SPECIFIC", label: "Specific products" },
  { mode: "COLLECTIONS", label: "Product collections" },
  { mode: "TAGS", label: "Product tags" },
];

const RULE_HELP: Record<EditorValues["productRule"]["mode"], string> = {
  ALL: "Notify me shows on every sold-out product.",
  EXCLUDE_PRODUCTS: "Notify me shows on every sold-out product except the ones you choose.",
  EXCLUDE_TAGS: "Notify me is hidden on products that have any of these tags.",
  SPECIFIC: "Notify me shows only on the products you choose.",
  COLLECTIONS: "Notify me shows only on products in these collections (product pages only).",
  TAGS: "Notify me shows only on products that have any of these tags.",
};

const gidOf = (type: "Product" | "Collection", id: string) => `gid://shopify/${type}/${id}`;

function Group(props: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <s-box padding="base" border="base" borderRadius="base" background="base">
      <s-stack gap="base">
        <s-stack gap="small-300">
          <s-heading>{props.title}</s-heading>
          {props.hint && <s-text color="subdued">{props.hint}</s-text>}
        </s-stack>
        {props.children}
      </s-stack>
    </s-box>
  );
}

export default function Editor() {
  const loaded = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();

  const [tab, setTab] = useState<TabId>(loaded.tab);
  const [values, setValues] = useState<EditorValues>(loaded.values);
  const [initial] = useState(() => JSON.stringify(loaded.values));
  const [submitted, setSubmitted] = useState(initial);
  // The baseline is what was last saved successfully: the loaded values, or the last submit that went through.
  const saved = fetcher.data?.ok ? submitted : initial;
  const dirty = useMemo(() => JSON.stringify(values) !== saved, [values, saved]);
  const saving = fetcher.state !== "idle";
  const errors = fetcher.data?.ok === false ? fetcher.data.errors : {};

  useEffect(() => {
    if (fetcher.data?.ok) void shopify.toast.show("Saved");
  }, [fetcher.data, shopify]);

  const setButton = (p: Partial<EditorValues["button"]>) => setValues((v) => ({ ...v, button: { ...v.button, ...p } }));
  const setForm = (p: Partial<EditorValues["form"]>) => setValues((v) => ({ ...v, form: { ...v.form, ...p } }));
  const setEmail = (p: Partial<EditorValues["email"]>) => setValues((v) => ({ ...v, email: { ...v.email, ...p } }));
  const setRule = (p: Partial<EditorValues["productRule"]>) =>
    setValues((v) => ({ ...v, productRule: { ...v.productRule, ...p } }));

  // Puts the controls of the open tab back to the built-in defaults (not saved until Save is pressed).
  const resetTab = () =>
    setValues((v) => {
      if (tab === "button") return { ...v, button: { ...DEFAULT_BUTTON }, showOn: ["product"], productRule: { mode: "ALL", ids: [], tags: [] } };
      if (tab === "form") return { ...v, form: { ...DEFAULT_FORM } };
      if (tab === "email") return { ...v, email: { ...v.email, heading: DEFAULT_EMAIL.heading, body: DEFAULT_EMAIL.body, buttonLabel: DEFAULT_EMAIL.buttonLabel, footer: DEFAULT_EMAIL.footer, logoUrl: DEFAULT_EMAIL.logoUrl, accentColor: DEFAULT_EMAIL.accentColor } };
      return { ...v, email: { ...v.email, senderName: DEFAULT_EMAIL.senderName, subject: DEFAULT_EMAIL.subject, previewText: DEFAULT_EMAIL.previewText } };
    });

  const save = () => {
    setSubmitted(JSON.stringify(values));
    fetcher.submit(values as unknown as Record<string, never>, { method: "post", encType: "application/json" });
  };

  const pick = async (type: "product" | "collection") => {
    const current = values.productRule.ids;
    const picked = await shopify.resourcePicker({
      type,
      multiple: true,
      action: "select",
      ...(type === "product" ? { filter: { variants: false } } : {}),
      selectionIds: current.map((id) => ({ id: gidOf(type === "product" ? "Product" : "Collection", id) })),
    });
    if (picked) setRule({ ids: picked.map((p) => p.id.split("/").pop() ?? "").filter(Boolean) });
  };

  const mode = values.productRule.mode;
  const idKind = mode === "COLLECTIONS" ? "collection" : "product";
  const needsIds = mode === "EXCLUDE_PRODUCTS" || mode === "SPECIFIC" || mode === "COLLECTIONS";
  const needsTags = mode === "EXCLUDE_TAGS" || mode === "TAGS";

  return (
    <s-page heading="Notify Me">
      <s-button slot="primary-action" variant="primary" onClick={save} {...(saving ? { loading: true } : {})} {...(dirty ? {} : { disabled: true })}>
        Save
      </s-button>
      <s-button slot="secondary-actions" href="/app/notify-me">Close</s-button>

      <s-stack gap="base">
        <s-stack direction="inline" gap="small-200">
          {TABS.map((t) => (
            <s-button key={t.id} variant={tab === t.id ? "primary" : "secondary"} onClick={() => setTab(t.id)}>
              {t.label}
            </s-button>
          ))}
        </s-stack>

        <s-grid gridTemplateColumns="minmax(280px, 1fr) minmax(280px, 1.4fr)" gap="base" alignItems="start">
          <s-stack gap="base">
            {tab === "button" && (
              <>
                <Group title="Button customize" hint="Text and colors of the button shown on sold-out products.">
                  <s-text-field label="Button text" value={values.button.text} error={errors["button.text"]}
                    onInput={(e: Event) => setButton({ text: val(e) })} />
                  <s-text-field label="Mixed stock subtext" value={values.button.mixedSubtext}
                    details="Shown when some variants are in stock and others are sold out."
                    onInput={(e: Event) => setButton({ mixedSubtext: val(e) })} />
                  <s-grid gridTemplateColumns="1fr 1fr" gap="small-200">
                    <s-number-field label="Border radius (px)" min={0} max={40} value={String(values.button.borderRadius)}
                      error={errors["button.borderRadius"]}
                      onInput={(e: Event) => setButton({ borderRadius: Math.round(Number(val(e)) || 0) })} />
                    <s-color-field label="Text color" value={values.button.textColor} error={errors["button.textColor"]}
                      onInput={(e: Event) => setButton({ textColor: val(e) })} />
                    <s-color-field label="Background" value={values.button.background} error={errors["button.background"]}
                      onInput={(e: Event) => setButton({ background: val(e) })} />
                    <s-color-field label="Subtext color" value={values.button.subtextColor} error={errors["button.subtextColor"]}
                      onInput={(e: Event) => setButton({ subtextColor: val(e) })} />
                  </s-grid>
                </Group>

                <Group title="Show button on" hint="Pick the pages where customers can ask to be notified.">
                  <s-grid gridTemplateColumns="1fr 1fr" gap="small-200">
                    {SHOW_ON.map((p) => (
                      <s-checkbox key={p} label={PAGE_LABELS[p]} checked={values.showOn.includes(p)}
                        onChange={(e: Event) =>
                          setValues((v) => ({
                            ...v,
                            showOn: checked(e) ? [...v.showOn.filter((x) => x !== p), p] : v.showOn.filter((x) => x !== p),
                          }))
                        } />
                    ))}
                  </s-grid>
                </Group>

                <Group title="Product options" hint="Choose which sold-out products get the button.">
                  <s-choice-list label="Which sold-out products get the button" labelAccessibilityVisibility="exclusive"
                    name="rule" values={[mode]}
                    onChange={(e: Event) => {
                      const next = ((e.currentTarget as HTMLElement & { values?: string[] }).values?.[0] ?? "ALL") as typeof mode;
                      setRule({ mode: next, ids: [], tags: [] });
                    }}>
                    {RULES.map((r) => <s-choice key={r.mode} value={r.mode}>{r.label}</s-choice>)}
                  </s-choice-list>
                  {needsIds && (
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                      <s-button onClick={() => void pick(idKind)}>
                        {values.productRule.ids.length ? `Change ${idKind}s` : `Choose ${idKind}s`}
                      </s-button>
                      <s-text color={errors["productRule.ids"] ? undefined : "subdued"}>
                        {errors["productRule.ids"] ?? `${values.productRule.ids.length} selected`}
                      </s-text>
                    </s-stack>
                  )}
                  {needsTags && (
                    <s-text-field label="Tags" details="Separate tags with commas." error={errors["productRule.tags"]}
                      value={values.productRule.tags.join(", ")}
                      onChange={(e: Event) =>
                        setRule({ tags: val(e).split(",").map((t) => t.trim()).filter(Boolean) })
                      } />
                  )}
                  <s-text color="subdued">{RULE_HELP[mode]}</s-text>
                </Group>
              </>
            )}

            {tab === "form" && (
              <>
                <Group title="Form content" hint="The popup customers fill in after tapping the button.">
                  <s-text-field label="Header" value={values.form.header} error={errors["form.header"]} onInput={(e: Event) => setForm({ header: val(e) })} />
                  <s-text-field label="Description" value={values.form.description} onInput={(e: Event) => setForm({ description: val(e) })} />
                  <s-text-field label="Email placeholder" value={values.form.emailPlaceholder} error={errors["form.emailPlaceholder"]}
                    onInput={(e: Event) => setForm({ emailPlaceholder: val(e) })} />
                  <s-text-field label="Email error" value={values.form.emailError} error={errors["form.emailError"]}
                    onInput={(e: Event) => setForm({ emailError: val(e) })} />
                  <s-text-field label="Button text" value={values.form.buttonText} error={errors["form.buttonText"]}
                    onInput={(e: Event) => setForm({ buttonText: val(e) })} />
                  <s-text-field label="Terms message" value={values.form.terms} onInput={(e: Event) => setForm({ terms: val(e) })} />
                </Group>
                <Group title="Opt-in marketing" hint="Adds a checkbox to the form. The choice is saved with the request.">
                  <s-checkbox label="Ask customers to receive marketing emails" checked={values.form.marketingOptIn}
                    onChange={(e: Event) => setForm({ marketingOptIn: checked(e) })} />
                  {values.form.marketingOptIn && (
                    <s-text-field label="Checkbox label" value={values.form.marketingLabel}
                      onInput={(e: Event) => setForm({ marketingLabel: val(e) })} />
                  )}
                </Group>
                <Group title="Confirm message" hint="Shown right after a customer signs up.">
                  <s-text-field label="Header" value={values.form.confirmHeader} error={errors["form.confirmHeader"]}
                    onInput={(e: Event) => setForm({ confirmHeader: val(e) })} />
                  <s-text-field label="Description" value={values.form.confirmDescription}
                    onInput={(e: Event) => setForm({ confirmDescription: val(e) })} />
                </Group>
              </>
            )}

            {tab === "email" && (
              <Group title="Email content" hint="The message customers get when the item is back. The product photo, options and price are added automatically.">
                <s-text-field label="Logo link (optional)" value={values.email.logoUrl} error={errors["email.logoUrl"]}
                  placeholder="https://…/logo.png"
                  details="A full https:// image link, about 400 px wide. Leave empty to use your store's logo from Shopify branding."
                  onInput={(e: Event) => setEmail({ logoUrl: val(e) })} />
                <s-color-field label="Button color" value={values.email.accentColor} error={errors["email.accentColor"]}
                  onInput={(e: Event) => setEmail({ accentColor: val(e) })} />
                <s-text-field label="Heading" value={values.email.heading} onInput={(e: Event) => setEmail({ heading: val(e) })} />
                <s-text-area label="Message" rows={4} value={values.email.body} onInput={(e: Event) => setEmail({ body: val(e) })} />
                <s-text-field label="Button label" value={values.email.buttonLabel} error={errors["email.buttonLabel"]}
                  onInput={(e: Event) => setEmail({ buttonLabel: val(e) })} />
                <s-text-area label="Footer (optional)" rows={2} value={values.email.footer} onInput={(e: Event) => setEmail({ footer: val(e) })} />
                <s-text color="subdued">
                  Variables: {"{{ product_name }}"} {"{{ variant_title }}"} {"{{ shop_name }}"} {"{{ price }}"} {"{{ product_url }}"}
                </s-text>
              </Group>
            )}

            {tab === "settings" && (
              <Group title="Email settings" hint="How the email appears in the inbox list.">
                <s-text-field label="Sender name" value={values.email.senderName} placeholder="Your store"
                  details="Leave empty to use your store name."
                  onInput={(e: Event) => setEmail({ senderName: val(e) })} />
                <s-text-field label="Subject" value={values.email.subject} error={errors["email.subject"]}
                  onInput={(e: Event) => setEmail({ subject: val(e) })} />
                <s-text-field label="Preview text" value={values.email.previewText}
                  details="Shown next to the subject in the inbox."
                  onInput={(e: Event) => setEmail({ previewText: val(e) })} />
                <s-text color="subdued">
                  Variables: {"{{ product_name }}"} {"{{ variant_title }}"} {"{{ shop_name }}"}. The from address and reply-to are on the Settings page.
                </s-text>
              </Group>
            )}
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-button variant="tertiary" tone="critical" onClick={resetTab}>Reset this tab to defaults</s-button>
              {dirty && <s-text color="subdued">Unsaved changes</s-text>}
            </s-stack>
          </s-stack>

          {/* Live preview of the tab being edited; it stays in view while the controls scroll. */}
          <div style={{ position: "sticky", top: 16, alignSelf: "start" }}>
          <s-box padding="large" background="subdued" borderRadius="base">
            <s-stack gap="base">
              <s-text color="subdued" type="strong">Live preview</s-text>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", minHeight: 420 }}>
              {tab === "button" && <ButtonPreview button={values.button} />}
              {tab === "form" && <FormPreview form={values.form} button={values.button} />}
              {tab === "email" && <EmailPreview email={values.email} />}
              {tab === "settings" && <InboxPreview email={values.email} />}
            </div>
            </s-stack>
          </s-box>
          </div>
        </s-grid>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
