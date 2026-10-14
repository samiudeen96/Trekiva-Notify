interface AdminGraphqlClient {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
}

export const LABELS_QUERY = `#graphql
  query NotifyLabels($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant { id displayName }
    }
  }
`;

/** "Product - Variant" names for variant ids. Missing or failed lookups just leave the id unnamed. */
export async function variantLabels(admin: AdminGraphqlClient, variantGids: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(variantGids)];
  if (ids.length === 0) return {};
  try {
    const res = await admin.graphql(LABELS_QUERY, { variables: { ids } });
    const json = (await res.json()) as { data?: { nodes: ({ id: string; displayName: string } | null)[] } };
    const out: Record<string, string> = {};
    for (const n of json.data?.nodes ?? []) if (n?.id) out[n.id] = n.displayName;
    return out;
  } catch {
    return {};
  }
}
