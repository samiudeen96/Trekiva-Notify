import { parseEmail } from "./email";

export interface VariantInfo {
  variantGid: string;
  productGid: string;
  inventoryItemGid: string | null;
  availableForSale: boolean;
}

export interface VariantGateway {
  find(variantGid: string): Promise<VariantInfo | null>;
}

export interface SubscriptionInput {
  shopDomain: string;
  productId: string;
  variantId: string;
  inventoryItemId: string | null;
  email: string;
  pageType: string | null;
  marketingOptIn: boolean;
}

export interface SubscriptionRepository {
  /** "created" for a new row, "reactivated" when a notified/unsubscribed row went back to PENDING. */
  save(input: SubscriptionInput): Promise<"created" | "reactivated" | "already">;
}

export type SubscribeOutcome =
  | { status: "subscribed" }
  | { status: "already" }
  | { status: "available" }
  | { status: "invalid_email" }
  | { status: "invalid_variant" };

export interface SubscribeRequest {
  shopDomain: string;
  productId: string;
  variantId: string;
  email: unknown;
  pageType?: string | null;
  marketingOptIn?: boolean;
}

const gid = (type: string, id: string) =>
  id.startsWith("gid://") ? id : `gid://shopify/${type}/${id}`;

const PAGE_TYPES = new Set(["product", "collection", "search", "index", "other"]);

export class SubscribeService {
  constructor(
    private readonly variants: VariantGateway,
    private readonly repo: SubscriptionRepository,
  ) {}

  async subscribe(req: SubscribeRequest): Promise<SubscribeOutcome> {
    const email = parseEmail(req.email);
    if (!email) return { status: "invalid_email" };

    // The ids come from the browser, so they are checked against Shopify: a made-up variant, or a
    // product id that does not own the variant, never produces a row.
    const info = await this.variants.find(gid("ProductVariant", req.variantId));
    if (!info || info.productGid !== gid("Product", req.productId)) return { status: "invalid_variant" };

    // Nothing to wait for: tell the storefront so it can show "add to cart" again.
    if (info.availableForSale) return { status: "available" };

    const result = await this.repo.save({
      shopDomain: req.shopDomain,
      productId: info.productGid,
      variantId: info.variantGid,
      inventoryItemId: info.inventoryItemGid,
      email,
      pageType: req.pageType && PAGE_TYPES.has(req.pageType) ? req.pageType : null,
      marketingOptIn: req.marketingOptIn === true,
    });
    return { status: result === "already" ? "already" : "subscribed" };
  }
}
