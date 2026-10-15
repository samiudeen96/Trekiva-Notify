import { describe, expect, it } from "vitest";
import { addEmails, normalizeEmail, parseEmail } from "./email";

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

describe("addEmails", () => {
  it("adds several addresses from one paste, any separator", () => {
    expect(addEmails([], "a@x.com, b@x.com; c@x.com\nD@X.com", 10).list).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
  });

  it("ignores duplicates, including different case", () => {
    expect(addEmails(["a@x.com"], "A@x.com, a@x.com, b@x.com", 10).list).toEqual(["a@x.com", "b@x.com"]);
  });

  it("reports invalid addresses and still adds the valid ones", () => {
    const r = addEmails([], "ok@x.com, nope, also@bad", 10);
    expect(r.list).toEqual(["ok@x.com"]);
    expect(r.invalid).toEqual(["nope", "also@bad"]);
  });

  it("stops at the maximum and reports the rest", () => {
    const r = addEmails(["a@x.com", "b@x.com"], "c@x.com, d@x.com", 3);
    expect(r.list).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(r.overflow).toEqual(["d@x.com"]);
  });

  it("does nothing for empty input", () => {
    expect(addEmails(["a@x.com"], "  ,  ", 10)).toEqual({ list: ["a@x.com"], invalid: [], overflow: [] });
  });
});
