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

const NODES_LIMIT = 250; // Shopify's cap for one nodes() call

/** "Product - Variant" names for variant ids. Missing or failed lookups just leave the id unnamed. */
export async function variantLabels(admin: AdminGraphqlClient, variantGids: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(variantGids)];
  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += NODES_LIMIT) {
    try {
      const res = await admin.graphql(LABELS_QUERY, { variables: { ids: ids.slice(i, i + NODES_LIMIT) } });
      const json = (await res.json()) as { data?: { nodes: ({ id: string; displayName: string } | null)[] } };
      for (const n of json.data?.nodes ?? []) if (n?.id) out[n.id] = n.displayName;
    } catch {
      /* this chunk stays unnamed */
    }
  }
  return out;
}

export const DETAILS_QUERY = `#graphql
  query NotifyVariantDetails($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant { id title sku product { title } }
    }
  }
`;

export interface VariantDetail {
  product: string;
  /** "Olive / 6"; empty for a single-variant product ("Default Title"). */
  variant: string;
  sku: string;
}

/** Product name, variant name and SKU per variant id, so a spreadsheet reads like the notify email. */
export async function variantDetails(admin: AdminGraphqlClient, variantGids: string[]): Promise<Record<string, VariantDetail>> {
  const ids = [...new Set(variantGids)];
  const out: Record<string, VariantDetail> = {};
  for (let i = 0; i < ids.length; i += NODES_LIMIT) {
    try {
      const res = await admin.graphql(DETAILS_QUERY, { variables: { ids: ids.slice(i, i + NODES_LIMIT) } });
      const json = (await res.json()) as {
        data?: { nodes: ({ id: string; title: string; sku: string | null; product: { title: string } } | null)[] };
      };
      for (const n of json.data?.nodes ?? []) {
        if (!n?.id) continue;
        out[n.id] = { product: n.product.title, variant: n.title === "Default Title" ? "" : n.title, sku: n.sku ?? "" };
      }
    } catch {
      /* this chunk stays unnamed */
    }
  }
  return out;
}

/** The detail for a variant, or a readable stand-in when it no longer exists in Shopify. */
export function detailOrUnknown(details: Record<string, VariantDetail>, variantGid: string): VariantDetail {
  return details[variantGid] ?? { product: `Unknown product (variant ${variantGid.split("/").pop()})`, variant: "", sku: "" };
}
