import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #111111");
const optionalEmail = z.union([z.literal(""), z.string().trim().toLowerCase().max(254).email("Enter a valid email address")]);

export const buttonSchema = z.object({
  text: text(60).min(1, "Button text is required"),
  mixedSubtext: text(120),
  borderRadius: z.number().int().min(0).max(40),
  textColor: color,
  background: color,
  subtextColor: color,
});

export const formSchema = z.object({
  header: text(80).min(1, "Header is required"),
  description: text(200),
  emailPlaceholder: text(60).min(1),
  emailError: text(100).min(1),
  buttonText: text(40).min(1, "Button text is required"),
  terms: text(160),
  marketingOptIn: z.boolean(),
  marketingLabel: text(120),
  confirmHeader: text(80).min(1),
  confirmDescription: text(200),
});

export const emailSchema = z.object({
  senderName: text(60),
  subject: text(150).min(1, "Subject is required"),
  previewText: text(150),
  heading: text(120),
  body: text(1000),
  buttonLabel: text(40).min(1, "Button label is required"),
  footer: text(300),
  logoUrl: z.union([z.literal(""), z.string().trim().max(500).regex(/^https:\/\//i, "Use a full https:// image link")]),
  accentColor: color,
});

export const SHOW_ON = ["product", "collection", "search", "home"] as const;

export const productRuleSchema = z
  .object({
    mode: z.enum(["ALL", "EXCLUDE_PRODUCTS", "EXCLUDE_TAGS", "SPECIFIC", "COLLECTIONS", "TAGS"]),
    ids: z.array(z.string().regex(/^\d+$/)).max(500).default([]),
    tags: z.array(text(60).min(1)).max(100).default([]),
  })
  .superRefine((rule, ctx) => {
    const needsIds = ["EXCLUDE_PRODUCTS", "SPECIFIC", "COLLECTIONS"].includes(rule.mode);
    const needsTags = ["EXCLUDE_TAGS", "TAGS"].includes(rule.mode);
    if (needsIds && rule.ids.length === 0) ctx.addIssue({ code: "custom", path: ["ids"], message: "Choose at least one item" });
    if (needsTags && rule.tags.length === 0) ctx.addIssue({ code: "custom", path: ["tags"], message: "Add at least one tag" });
  });

/** Everything the Notify me editor saves. */
export const editorSchema = z.object({
  button: buttonSchema,
  form: formSchema,
  email: emailSchema,
  showOn: z.array(z.enum(SHOW_ON)).max(4),
  productRule: productRuleSchema,
});
export type EditorValues = z.infer<typeof editorSchema>;

/** The Settings page. */
export const generalSchema = z.object({
  enabled: z.boolean(),
  hidePurchaseButtons: z.boolean(),
  senderEmail: optionalEmail,
  replyTo: optionalEmail,
  enabledLocationIds: z.array(z.string().regex(/^gid:\/\/shopify\/Location\/\d+$/)).max(250),
  minStockThreshold: z.number().int().min(1).max(100000),
  reportFrequency: z.enum(["", "DAILY", "WEEKLY", "MONTHLY"]),
  reportEmail: optionalEmail,
  reportCc: z.array(z.string().trim().toLowerCase().max(254).email()).max(10),
});
export type GeneralValues = z.infer<typeof generalSchema>;

/** First error message per dotted path, for showing under the matching field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
