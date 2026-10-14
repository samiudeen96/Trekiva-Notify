import type { RestockEmailVars } from "./template";

/** Sample product used by the editor previews and the "send test email" button. */
export const SAMPLE: RestockEmailVars = {
  shopName: "Your store",
  productName: "Hiking shoes",
  variantTitle: "Black / Medium",
  options: [
    { name: "Color", value: "Black" },
    { name: "Size", value: "Medium" },
  ],
  // Preview only: a neutral placeholder so the layout shows how a product photo sits.
  imageUrl: "https://placehold.co/432x432/f1f1f1/999999/png?text=Product",
  price: "$100.00",
  compareAtPrice: "$140.00",
  shopLogoUrl: null,
  storeUrl: "https://example.com",
  productUrl: "https://example.com/products/hiking-shoes",
  unsubscribeUrl: "https://example.com/unsubscribe",
};
