import db from "../db.server";
import {
  DEFAULT_BUTTON,
  DEFAULT_FORM,
  DEFAULT_SHOW_ON,
  mergeConfig,
  type ButtonConfig,
  type FormConfig,
  type ProductRule,
} from "./defaults";

export interface StorefrontConfig {
  enabled: boolean;
  showOn: string[];
  productRule: ProductRule;
  button: ButtonConfig;
  form: FormConfig;
}

const RULE_MODES = ["ALL", "EXCLUDE_PRODUCTS", "EXCLUDE_TAGS", "SPECIFIC", "COLLECTIONS", "TAGS"];

function parseRule(value: unknown): ProductRule {
  if (typeof value === "object" && value !== null) {
    const v = value as Record<string, unknown>;
    if (typeof v.mode === "string" && RULE_MODES.includes(v.mode)) {
      const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
      return { mode: v.mode as ProductRule["mode"], ids: strings(v.ids), tags: strings(v.tags) };
    }
  }
  return { mode: "ALL" };
}

/** What the storefront script needs. Only public, non-secret presentation settings. */
export async function getStorefrontConfig(shopDomain: string): Promise<StorefrontConfig> {
  const row = await db.settings.findUnique({ where: { shopDomain } });
  return {
    // A shop that never opened the admin has no row: the button defaults to on.
    enabled: row?.enabled ?? true,
    showOn: row?.showOn?.length ? row.showOn : DEFAULT_SHOW_ON,
    productRule: parseRule(row?.productRule),
    button: mergeConfig(DEFAULT_BUTTON, row?.buttonConfig),
    form: mergeConfig(DEFAULT_FORM, row?.formConfig),
  };
}
