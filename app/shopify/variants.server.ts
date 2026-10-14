import type { VariantGateway, VariantInfo } from "../subscriptions/subscribe.service";

interface AdminGraphqlClient {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
}

export const VARIANT_QUERY = `#graphql
  query NotifyVariant($id: ID!) {
    productVariant(id: $id) {
      id
      availableForSale
      inventoryItem { id }
      product { id }
    }
  }
`;

export function createVariantGateway(admin: AdminGraphqlClient): VariantGateway {
  return {
    async find(variantGid: string): Promise<VariantInfo | null> {
      const res = await admin.graphql(VARIANT_QUERY, { variables: { id: variantGid } });
      const json = (await res.json()) as {
        data?: {
          productVariant: {
            id: string;
            availableForSale: boolean;
            inventoryItem: { id: string } | null;
            product: { id: string };
          } | null;
        };
        errors?: unknown;
      };
      if (json.errors || !json.data) throw new Error("variant lookup failed");
      const v = json.data.productVariant;
      if (!v) return null;
      return {
        variantGid: v.id,
        productGid: v.product.id,
        inventoryItemGid: v.inventoryItem?.id ?? null,
        availableForSale: v.availableForSale,
      };
    },
  };
}
