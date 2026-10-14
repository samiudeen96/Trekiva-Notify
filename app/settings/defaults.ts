export interface ButtonConfig {
  text: string;
  mixedSubtext: string;
  borderRadius: number;
  textColor: string;
  background: string;
  subtextColor: string;
}

export interface FormConfig {
  header: string;
  description: string;
  emailPlaceholder: string;
  emailError: string;
  buttonText: string;
  terms: string;
  marketingOptIn: boolean;
  marketingLabel: string;
  confirmHeader: string;
  confirmDescription: string;
}

export type ProductRuleMode =
  | "ALL"
  | "EXCLUDE_PRODUCTS"
  | "EXCLUDE_TAGS"
  | "SPECIFIC"
  | "COLLECTIONS"
  | "TAGS";

export interface ProductRule {
  mode: ProductRuleMode;
  /** Product or collection numeric ids (as strings) for the *_PRODUCTS / COLLECTIONS modes. */
  ids?: string[];
  tags?: string[];
}

export const DEFAULT_BUTTON: ButtonConfig = {
  text: "Notify me when available",
  mixedSubtext: "Get notified when your item is back in stock",
  borderRadius: 8,
  textColor: "#FFFFFF",
  background: "#111111",
  subtextColor: "#6D7175",
};

export const DEFAULT_FORM: FormConfig = {
  header: "Get notified when it's back",
  description: "We'll email you as soon as this item is available.",
  emailPlaceholder: "Enter your email address",
  emailError: "Please enter a valid email address",
  buttonText: "Notify me when available",
  terms: "No spam. Unsubscribe anytime.",
  marketingOptIn: false,
  marketingLabel: "Email me about news and offers",
  confirmHeader: "Thanks for your request",
  confirmDescription: "We will notify you when the product is available.",
};

export const DEFAULT_SHOW_ON = ["product"];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Stored JSON overlaid on the defaults, keeping only keys the defaults know and values of the same type. */
export function mergeConfig<T extends object>(defaults: T, stored: unknown): T {
  if (!isObject(stored)) return { ...defaults };
  const base = defaults as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    const value = stored[key];
    if (value !== undefined && typeof value === typeof base[key]) out[key] = value;
  }
  return out as T;
}

export interface EmailConfig {
  /** Display name of the sender. Empty = the shop's name. */
  senderName: string;
  subject: string;
  previewText: string;
  heading: string;
  body: string;
  buttonLabel: string;
  footer: string;
  /** Logo shown at the top. Empty = the store's logo from Shopify branding, then the store name. */
  logoUrl: string;
  /** Logo height in pixels; the width follows the image's proportions. */
  logoHeight: number;
  /** Button colour in the email. */
  accentColor: string;
}

export const DEFAULT_EMAIL: EmailConfig = {
  senderName: "",
  subject: "{{ product_name }} is now available",
  previewText: "{{ product_name }} is back in stock",
  heading: "It's back in stock!",
  body: "The item you asked about is available again. Stock is limited, so order soon.",
  buttonLabel: "Buy now",
  footer: "",
  logoUrl: "",
  logoHeight: 40,
  accentColor: "#111111",
};
