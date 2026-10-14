import { describe, expect, it } from "vitest";
import { escapeHtml, renderRestockEmail, safeUrl, type RestockEmailVars } from "./template";

const vars: RestockEmailVars = {
  shopName: "Trekiva",
  productName: 'Sandals <b>"TPG"</b>',
  variantTitle: "Tan / 6",
  imageUrl: "https://cdn.example.com/a.jpg",
  price: "₹720.00",
  productUrl: "https://trekiva.com/products/x?variant=1",
  unsubscribeUrl: "https://app.example.com/unsubscribe?token=t",
};

describe("renderRestockEmail", () => {
  it("fills the default subject and sender from the shop", () => {
    const r = renderRestockEmail({}, vars);
    expect(r.subject).toBe('Sandals <b>"TPG"</b> is now available');
    expect(r.fromName).toBe("Trekiva");
  });

  it("escapes product data in the HTML", () => {
    const r = renderRestockEmail({}, vars);
    expect(r.html).not.toContain("<b>");
    expect(r.html).toContain("Sandals &lt;b&gt;&quot;TPG&quot;&lt;/b&gt;");
  });

  it("uses merchant overrides and ignores values of the wrong type", () => {
    const r = renderRestockEmail({ subject: "Back: {{ product_name }}", senderName: "Team", heading: 42 }, { ...vars, productName: "Boot" });
    expect(r.subject).toBe("Back: Boot");
    expect(r.fromName).toBe("Team");
    expect(r.html).toContain("It&#39;s back in stock!");
  });

  it("keeps the subject on one line", () => {
    expect(renderRestockEmail({}, { ...vars, productName: "A\r\nBcc: x@y.z" }).subject).not.toMatch(/[\r\n]/);
  });

  it("includes the unsubscribe link in both parts", () => {
    const r = renderRestockEmail({}, vars);
    expect(r.html).toContain("unsubscribe?token=t");
    expect(r.text).toContain("unsubscribe?token=t");
  });

  it("omits the variant line for a default-title variant", () => {
    expect(renderRestockEmail({}, { ...vars, variantTitle: "Default Title" }).html).not.toContain("Default Title");
  });
});

describe("product and brand", () => {
  const withOptions = { ...vars, productName: "Sandals", options: [{ name: "Color", value: "Tan" }, { name: "Size", value: "6" }] };

  it("shows the exact options the customer asked about", () => {
    const r = renderRestockEmail({}, withOptions);
    expect(r.html).toContain("Color: <span");
    expect(r.html).toContain(">Tan<");
    expect(r.html).toContain(">6<");
    expect(r.text).toContain("Color: Tan");
    expect(r.text).toContain("Size: 6");
  });

  it("hides the placeholder option of a single-variant product", () => {
    const r = renderRestockEmail({}, { ...vars, options: [{ name: "Title", value: "Default Title" }], variantTitle: "Default Title" });
    expect(r.html).not.toContain("Default Title");
  });

  it("shows the sale price struck through", () => {
    const r = renderRestockEmail({}, { ...vars, compareAtPrice: "₹1,599.00" });
    expect(r.html).toContain("line-through");
    expect(r.text).toContain("was ₹1,599.00");
  });

  it("uses the merchant logo, else the store logo, else the shop name", () => {
    expect(renderRestockEmail({ logoUrl: "https://cdn.example.com/mine.png" }, { ...vars, shopLogoUrl: "https://cdn.example.com/shop.png" }).html).toContain("mine.png");
    expect(renderRestockEmail({}, { ...vars, shopLogoUrl: "https://cdn.example.com/shop.png" }).html).toContain("shop.png");
    const none = renderRestockEmail({}, { ...vars, shopLogoUrl: null }).html;
    expect(none).not.toContain("<img src=\"https://cdn.example.com/a.jpg\" alt=\"Trekiva\"");
    expect(none).toContain(">Trekiva</span>");
  });

  it("blocks a non-http logo and a bad accent colour", () => {
    const r = renderRestockEmail({ logoUrl: "javascript:alert(1)", accentColor: "red;background:url(x)" }, vars);
    expect(r.html).not.toContain("javascript:");
    expect(r.html).toContain("background:#111111");
  });

  it("works without a product image", () => {
    expect(renderRestockEmail({}, { ...vars, imageUrl: null }).html).toContain("In stock now");
  });
});

describe("footer", () => {
  it("links back to the store in both parts when the store url is known", () => {
    const r = renderRestockEmail({}, { ...vars, storeUrl: "https://trekiva.com" });
    expect(r.html).toContain('href="https://trekiva.com"');
    expect(r.text).toContain("Continue shopping: https://trekiva.com");
  });

  it("stacks on small screens", () => {
    expect(renderRestockEmail({}, vars).html).toContain("@media (max-width:480px)");
  });
});

describe("helpers", () => {
  it("blocks non-http urls", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("https://a.b")).toBe("https://a.b");
  });
  it("escapes the five html characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
