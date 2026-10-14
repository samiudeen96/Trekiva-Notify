import { describe, expect, it } from "vitest";
import { normalizeEmail, parseEmail } from "./email";

describe("email", () => {
  it("normalises case and whitespace", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("accepts a valid address", () => {
    expect(parseEmail(" A@b.co ")).toBe("a@b.co");
  });

  it.each(["", "nope", "a@b", "a b@c.com", 42, null, `${"a".repeat(250)}@b.com`])(
    "rejects %s",
    (v) => expect(parseEmail(v)).toBeNull(),
  );
});
