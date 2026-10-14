import { describe, expect, it } from "vitest";
import {
  SubscribeService,
  type SubscriptionInput,
  type SubscriptionRepository,
  type VariantGateway,
  type VariantInfo,
} from "./subscribe.service";

const soldOut: VariantInfo = {
  variantGid: "gid://shopify/ProductVariant/11",
  productGid: "gid://shopify/Product/1",
  inventoryItemGid: "gid://shopify/InventoryItem/21",
  availableForSale: false,
};

function setup(info: VariantInfo | null, saveResult: "created" | "reactivated" | "already" = "created") {
  const saved: SubscriptionInput[] = [];
  const variants: VariantGateway = { find: async () => info };
  const repo: SubscriptionRepository = {
    save: async (input) => {
      saved.push(input);
      return saveResult;
    },
  };
  return { service: new SubscribeService(variants, repo), saved };
}

const req = { shopDomain: "s.myshopify.com", productId: "1", variantId: "11", email: " Buyer@Example.com " };

describe("SubscribeService", () => {
  it("stores a normalised subscription for a sold-out variant", async () => {
    const { service, saved } = setup(soldOut);
    expect(await service.subscribe({ ...req, pageType: "product", marketingOptIn: true })).toEqual({ status: "subscribed" });
    expect(saved).toEqual([
      {
        shopDomain: "s.myshopify.com",
        productId: soldOut.productGid,
        variantId: soldOut.variantGid,
        inventoryItemId: soldOut.inventoryItemGid,
        email: "buyer@example.com",
        pageType: "product",
        marketingOptIn: true,
      },
    ]);
  });

  it("reports an existing pending request as already subscribed", async () => {
    const { service } = setup(soldOut, "already");
    expect(await service.subscribe(req)).toEqual({ status: "already" });
  });

  it("rejects an invalid email without calling Shopify", async () => {
    const { service, saved } = setup(soldOut);
    expect(await service.subscribe({ ...req, email: "nope" })).toEqual({ status: "invalid_email" });
    expect(saved).toHaveLength(0);
  });

  it("rejects an unknown variant", async () => {
    const { service, saved } = setup(null);
    expect(await service.subscribe(req)).toEqual({ status: "invalid_variant" });
    expect(saved).toHaveLength(0);
  });

  it("rejects a product id that does not own the variant", async () => {
    const { service, saved } = setup(soldOut);
    expect(await service.subscribe({ ...req, productId: "999" })).toEqual({ status: "invalid_variant" });
    expect(saved).toHaveLength(0);
  });

  it("does not subscribe when the variant is already available", async () => {
    const { service, saved } = setup({ ...soldOut, availableForSale: true });
    expect(await service.subscribe(req)).toEqual({ status: "available" });
    expect(saved).toHaveLength(0);
  });

  it("drops an unknown page type", async () => {
    const { service, saved } = setup(soldOut);
    await service.subscribe({ ...req, pageType: "<script>" });
    expect(saved[0]?.pageType).toBeNull();
  });
});
