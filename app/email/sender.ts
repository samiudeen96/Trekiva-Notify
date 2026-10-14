/** Address part of an RFC 5322 sender: "Trekiva <notify@trekiva.com>" -> notify@trekiva.com. */
export function addressOf(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1]! : from).trim();
}

function domainOf(address: string): string {
  return address.split("@")[1]?.toLowerCase() ?? "";
}

/**
 * "Display Name <address>". The address is EMAIL_FROM's. A merchant-chosen address replaces it only
 * on the same domain: Resend rejects (and spoofing protection would flag) any other domain.
 */
export function buildFrom(envFrom: string, displayName: string, override?: string | null): string {
  const base = addressOf(envFrom);
  const address =
    override && /^[^\s@<>]+@[^\s@<>]+$/.test(override) && domainOf(override) === domainOf(base) ? override : base;
  // Quotes and angle brackets would break the header; a display name needs neither.
  const name = displayName.replace(/["<>\r\n]/g, "").trim();
  return name ? `${name} <${address}>` : address;
}
