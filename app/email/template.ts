import { DEFAULT_EMAIL, mergeConfig, type EmailConfig } from "../settings/defaults";

export interface RestockEmailVars {
  shopName: string;
  productName: string;
  variantTitle: string;
  imageUrl: string | null;
  price: string | null;
  productUrl: string;
  unsubscribeUrl: string;
}

export interface RenderedEmail {
  fromName: string;
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) URLs may reach an href/src; anything else (javascript:, data:) becomes "#". */
export function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : "#";
}

/** Replaces {{ variables }}; `escape` is applied to the literal text as well as to the values. */
function substitute(template: string, vars: Record<string, string>, escape: (s: string) => string): string {
  let out = "";
  let last = 0;
  for (const m of template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) {
    out += escape(template.slice(last, m.index)) + escape(vars[m[1]!] ?? "");
    last = m.index + m[0].length;
  }
  return out + escape(template.slice(last));
}

/** `stored` is the merchant's saved email settings (JSON); missing keys fall back to the defaults. */
export function renderRestockEmail(stored: unknown, v: RestockEmailVars): RenderedEmail {
  const c: EmailConfig = mergeConfig(DEFAULT_EMAIL, stored);
  const vars = {
    product_name: v.productName,
    variant_title: v.variantTitle,
    shop_name: v.shopName,
    product_url: v.productUrl,
    price: v.price ?? "",
  };
  const plain = (s: string) => substitute(s, vars, (x) => x);
  const html = (s: string) => substitute(s, vars, escapeHtml);

  const variantLine = v.variantTitle && v.variantTitle !== "Default Title" ? v.variantTitle : "";
  const preview = plain(c.previewText);

  const body = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px;">
<tr><td style="font-size:14px;color:#6d7175;padding-bottom:12px;">${escapeHtml(v.shopName)}</td></tr>
<tr><td style="font-size:22px;font-weight:700;padding-bottom:12px;">${html(c.heading)}</td></tr>
${v.imageUrl ? `<tr><td style="padding-bottom:16px;"><img src="${escapeHtml(safeUrl(v.imageUrl))}" alt="${escapeHtml(v.productName)}" width="200" style="display:block;border-radius:8px;max-width:100%;height:auto;"></td></tr>` : ""}
<tr><td style="font-size:16px;font-weight:600;">${escapeHtml(v.productName)}</td></tr>
${variantLine ? `<tr><td style="font-size:14px;color:#6d7175;padding-top:2px;">${escapeHtml(variantLine)}</td></tr>` : ""}
${v.price ? `<tr><td style="font-size:14px;padding-top:2px;">${escapeHtml(v.price)}</td></tr>` : ""}
<tr><td style="font-size:15px;line-height:1.5;padding:14px 0 20px;">${html(c.body)}</td></tr>
<tr><td><a href="${escapeHtml(safeUrl(v.productUrl))}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:8px;">${html(c.buttonLabel)}</a></td></tr>
${c.footer ? `<tr><td style="font-size:13px;color:#6d7175;padding-top:22px;">${html(c.footer)}</td></tr>` : ""}
<tr><td style="font-size:12px;color:#8c9196;padding-top:24px;">You asked to be notified when this item was back in stock. <a href="${escapeHtml(safeUrl(v.unsubscribeUrl))}" style="color:#8c9196;">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    plain(c.heading),
    "",
    v.productName + (variantLine ? ` - ${variantLine}` : ""),
    v.price ?? "",
    "",
    plain(c.body),
    "",
    `${plain(c.buttonLabel)}: ${v.productUrl}`,
    c.footer ? `\n${plain(c.footer)}` : "",
    "",
    `Unsubscribe: ${v.unsubscribeUrl}`,
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");

  return {
    fromName: c.senderName.trim() || v.shopName,
    // A subject is one line: strip any newline a variable (product title) could carry.
    subject: plain(c.subject).replace(/[\r\n]+/g, " ").trim(),
    html: body,
    text,
  };
}
