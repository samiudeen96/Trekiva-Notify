import { describe, expect, it } from "vitest";
import { addressOf, buildFrom } from "./sender";

describe("sender", () => {
  it("extracts the address", () => {
    expect(addressOf("Trekiva <notify@trekiva.com>")).toBe("notify@trekiva.com");
    expect(addressOf("notify@trekiva.com")).toBe("notify@trekiva.com");
  });

  it("uses the shop name with the configured address", () => {
    expect(buildFrom("Trekiva <notify@trekiva.com>", "Trekiva Footwear")).toBe("Trekiva Footwear <notify@trekiva.com>");
  });

  it("accepts an override on the same domain only", () => {
    expect(buildFrom("n@trekiva.com", "T", "care@trekiva.com")).toBe("T <care@trekiva.com>");
    expect(buildFrom("n@trekiva.com", "T", "care@other.com")).toBe("T <n@trekiva.com>");
  });

  it("strips characters that break the header", () => {
    expect(buildFrom("n@trekiva.com", 'A"<b>\r\nBcc: x')).not.toMatch(/["\r\n]|<b>/);
  });
});
