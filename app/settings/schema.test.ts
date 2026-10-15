import { describe, expect, it } from "vitest";
import { DEFAULT_BUTTON, DEFAULT_EMAIL, DEFAULT_FORM } from "./defaults";
import { editorSchema, fieldErrors, generalSchema } from "./schema";

const editor = { button: DEFAULT_BUTTON, form: DEFAULT_FORM, email: DEFAULT_EMAIL, showOn: ["product"], productRule: { mode: "ALL" } };

describe("editorSchema", () => {
  it("accepts the defaults", () => {
    // The default subject and sender name must themselves be valid, or a fresh shop could not save.
    expect(editorSchema.safeParse(editor).success).toBe(true);
  });

  it("rejects a bad colour and reports it by path", () => {
    const r = editorSchema.safeParse({ ...editor, button: { ...DEFAULT_BUTTON, background: "red" } });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)["button.background"]).toBeTruthy();
  });

  it("requires items for a rule that needs them", () => {
    const r = editorSchema.safeParse({ ...editor, productRule: { mode: "SPECIFIC", ids: [] } });
    expect(r.success).toBe(false);
    expect(editorSchema.safeParse({ ...editor, productRule: { mode: "TAGS", tags: ["sale"] } }).success).toBe(true);
  });

  it("keeps the logo height in range", () => {
    expect(editorSchema.safeParse({ ...editor, email: { ...DEFAULT_EMAIL, logoHeight: 80 } }).success).toBe(true);
    expect(editorSchema.safeParse({ ...editor, email: { ...DEFAULT_EMAIL, logoHeight: 5 } }).success).toBe(false);
    expect(editorSchema.safeParse({ ...editor, email: { ...DEFAULT_EMAIL, logoHeight: 500 } }).success).toBe(false);
  });

  it("rejects unknown pages", () => {
    expect(editorSchema.safeParse({ ...editor, showOn: ["cart"] }).success).toBe(false);
  });
});

describe("generalSchema", () => {
  const base = {
    enabled: true, senderEmail: "", replyTo: "", enabledLocationIds: [],
    minStockThreshold: 1, reportFrequency: "", reportHour: 10, reportWeekday: 2, reportMonthDay: 1, reportFormat: "EXCEL", reportEmail: "", reportCc: [],
  };

  it("accepts blank optional fields", () => {
    expect(generalSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a zero threshold and a malformed location id", () => {
    expect(generalSchema.safeParse({ ...base, minStockThreshold: 0 }).success).toBe(false);
    expect(generalSchema.safeParse({ ...base, enabledLocationIds: ["1"] }).success).toBe(false);
  });

  it("lowercases emails", () => {
    const r = generalSchema.safeParse({ ...base, reportEmail: "Care@Trekiva.com" });
    expect(r.success && r.data.reportEmail).toBe("care@trekiva.com");
  });
});
