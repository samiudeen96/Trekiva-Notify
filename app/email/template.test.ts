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

describe("helpers", () => {
  it("blocks non-http urls", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("https://a.b")).toBe("https://a.b");
  });
  it("escapes the five html characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
