/** Cart attribute the storefront script sets when a customer lands from a restock email. */
export const ATTRIBUTE_NAME = "trekiva_notify";
export const WINDOW_DAYS = 7;

const ID_RE = /^[a-z0-9]{20,40}$/i;

interface OrderLike {
  note_attributes?: { name?: string; value?: unknown }[] | null;
  landing_site?: string | null;
}

/** The subscription id the order came from: the cart attribute first, the landing page's ?notify= as backup. */
export function extractNotifyId(order: OrderLike): string | null {
  const attr = order.note_attributes?.find((a) => a?.name === ATTRIBUTE_NAME)?.value;
  if (typeof attr === "string" && ID_RE.test(attr)) return attr;

  if (order.landing_site) {
    try {
      const id = new URL(order.landing_site, "https://x.invalid").searchParams.get("notify");
      if (id && ID_RE.test(id)) return id;
    } catch {
      /* not a URL */
    }
  }
  return null;
}

interface LineItem {
  variant_id?: number | string | null;
  price?: string;
  quantity?: number;
  total_discount?: string;
}

/** What the customer paid for the variant they were notified about (after line discounts). */
export function revenueForVariant(lines: LineItem[], variantNumericId: string): number {
  let total = 0;
  for (const l of lines) {
    if (String(l.variant_id ?? "") !== variantNumericId) continue;
    const gross = Number(l.price ?? 0) * (l.quantity ?? 0);
    total += Math.max(0, gross - Number(l.total_discount ?? 0));
  }
  return Math.round(total * 100) / 100;
}

export function withinWindow(notifiedAt: Date | null, orderAt: Date): boolean {
  if (!notifiedAt) return false;
  const ms = orderAt.getTime() - notifiedAt.getTime();
  return ms >= 0 && ms <= WINDOW_DAYS * 86_400_000;
}
