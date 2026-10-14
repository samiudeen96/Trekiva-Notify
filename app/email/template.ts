import { DEFAULT_EMAIL, mergeConfig, type EmailConfig } from "../settings/defaults";

export interface RestockEmailVars {
  shopName: string;
  productName: string;
  variantTitle: string;
  imageUrl: string | null;
  price: string | null;
  /** Original price when the variant is on sale. */
  compareAtPrice?: string | null;
  /** The exact options the customer asked about, e.g. [{ name: "Color", value: "Tan" }, { name: "Size", value: "6" }]. */
  options?: { name: string; value: string }[];
  /** The store's own logo from Shopify branding; used when the merchant set none. */
  shopLogoUrl?: string | null;
  /** The store's customer-facing address, e.g. https://trekiva.com. */
  storeUrl?: string;
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

  // A product with a single variant reports "Title: Default Title"; that is not worth showing.
  const options = (v.options ?? []).filter((o) => !(o.name === "Title" && o.value === "Default Title"));
  const variantLine = options.length
    ? options.map((o) => `${o.name}: ${o.value}`).join(" · ")
    : v.variantTitle && v.variantTitle !== "Default Title"
      ? v.variantTitle
      : "";

  const accent = /^#[0-9a-fA-F]{6}$/.test(c.accentColor) ? c.accentColor : "#111111";
  const logo = c.logoUrl || v.shopLogoUrl || "";
  const preview = plain(c.previewText);

  // The height is the merchant's choice (16-120 px); the width follows the image and never exceeds the card.
  const logoHeight = Math.min(120, Math.max(16, Math.round(Number(c.logoHeight)) || 40));
  const header = logo
    ? `<img src="${escapeHtml(safeUrl(logo))}" alt="${escapeHtml(v.shopName)}" height="${logoHeight}" style="display:block;margin:0 auto;height:${logoHeight}px;width:auto;max-width:100%;">`
    : `<span style="font-size:18px;font-weight:700;color:#111;">${escapeHtml(v.shopName)}</span>`;

  const optionRows = options.length
    ? options
        .map(
          (o) =>
            `<div style="font-size:13px;color:#6d7175;padding-top:3px;">${escapeHtml(o.name)}: <span style="color:#111;font-weight:600;">${escapeHtml(o.value)}</span></div>`,
        )
        .join("")
    : variantLine
      ? `<div style="font-size:13px;color:#6d7175;padding-top:3px;">${escapeHtml(variantLine)}</div>`
      : "";

  const priceRow = v.price
    ? `<div style="padding-top:8px;font-size:16px;font-weight:700;">${escapeHtml(v.price)}${
        v.compareAtPrice
          ? ` <span style="font-size:13px;font-weight:400;color:#8c9196;text-decoration:line-through;">${escapeHtml(v.compareAtPrice)}</span>`
          : ""
      }</div>`
    : "";

  const details = `<div style="font-size:12px;font-weight:700;color:#2e7d32;padding-bottom:5px;">&#9679; In stock now</div>
<div style="font-size:17px;font-weight:700;line-height:1.3;">${escapeHtml(v.productName)}</div>${optionRows}${priceRow}`;

  const productBlock = v.imageUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e1e3e5;border-radius:12px;"><tr>
<td class="tn-img" width="176" valign="top" style="padding:12px;"><a href="${escapeHtml(safeUrl(v.productUrl))}"><img src="${escapeHtml(safeUrl(v.imageUrl))}" alt="${escapeHtml(v.productName)}" width="152" style="display:block;width:152px;max-width:100%;height:auto;border-radius:8px;"></a></td>
<td class="tn-info" valign="top" style="padding:14px 14px 14px 0;">${details}</td></tr></table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e1e3e5;border-radius:12px;"><tr><td style="padding:14px;">${details}</td></tr></table>`;

  const body = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">
<style>@media (max-width:480px){.tn-img,.tn-info{display:block!important;width:100%!important;box-sizing:border-box;}.tn-info{padding:0 14px 14px!important;}.tn-img img{width:100%!important;}.tn-pad{padding-left:20px!important;padding-right:20px!important;}}</style></head>
<body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:14px">
<tr><td class="tn-pad" align="center" style="padding:24px 28px 18px;border-bottom:1px solid #f0f0f0;text-align:center;">${header}</td></tr>
<tr><td class="tn-pad" style="padding:26px 28px 0;font-size:24px;font-weight:700;line-height:1.25;">${html(c.heading)}</td></tr>
<tr><td class="tn-pad" style="padding:10px 28px 0;font-size:15px;line-height:1.55;color:#303030;">${html(c.body)}</td></tr>
<tr><td class="tn-pad" style="padding:20px 28px 0;">${productBlock}</td></tr>
<tr><td class="tn-pad" style="padding:22px 28px 0;"><a href="${escapeHtml(safeUrl(v.productUrl))}" style="display:block;text-align:center;background:${accent};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 24px;border-radius:10px;">${html(c.buttonLabel)}</a></td></tr>
${c.footer ? `<tr><td class="tn-pad" style="padding:20px 28px 0;font-size:13px;line-height:1.5;color:#6d7175;">${html(c.footer)}</td></tr>` : ""}
${v.storeUrl ? `<tr><td class="tn-pad" style="padding:20px 28px 0;font-size:13px;text-align:center;"><a href="${escapeHtml(safeUrl(v.storeUrl))}" style="color:#111;font-weight:600;text-decoration:none;">Continue shopping at ${escapeHtml(v.shopName)} &rarr;</a></td></tr>` : ""}
<tr><td class="tn-pad" style="padding:24px 28px 26px;font-size:12px;line-height:1.5;color:#8c9196;text-align:center;">You asked to be notified when this item was back in stock. <a href="${escapeHtml(safeUrl(v.unsubscribeUrl))}" style="color:#8c9196;">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    plain(c.heading),
    "",
    plain(c.body),
    "",
    v.productName,
    ...options.map((o) => `${o.name}: ${o.value}`),
    ...(!options.length && variantLine ? [variantLine] : []),
    v.price ? `${v.price}${v.compareAtPrice ? ` (was ${v.compareAtPrice})` : ""}` : "",
    "",
    `${plain(c.buttonLabel)}: ${v.productUrl}`,
    c.footer ? `\n${plain(c.footer)}` : "",
    "",
    ...(v.storeUrl ? [`Continue shopping: ${v.storeUrl}`, ""] : []),
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
