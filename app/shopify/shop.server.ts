interface AdminGraphqlClient {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
}

const QUERY = `#graphql
  query NotifyShopBasics { shop { name ianaTimezone } }
`;

/** The shop's display name and IANA time zone; UTC and the domain when Shopify cannot be reached. */
export async function shopBasics(admin: AdminGraphqlClient, fallbackName: string): Promise<{ name: string; timeZone: string }> {
  try {
    const res = await admin.graphql(QUERY);
    const shop = ((await res.json()) as { data?: { shop: { name: string; ianaTimezone: string } } }).data?.shop;
    if (shop) return { name: shop.name, timeZone: shop.ianaTimezone };
  } catch {
    /* fall through to the defaults */
  }
  return { name: fallbackName, timeZone: "UTC" };
}
