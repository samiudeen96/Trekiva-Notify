import { describe, expect, it } from "vitest";
import { renderReportEmail } from "./template";

describe("renderReportEmail", () => {
  const base = { shopName: "Trekiva", frequency: "WEEKLY" as const, adminUrl: "https://admin.example.com/x" };

  it("summarises the requests and pluralises", () => {
    const r = renderReportEmail({ ...base, total: 3, rows: [{ item: "Sandal - Tan / 6", count: 2 }, { item: "Boot", count: 1 }] });
    expect(r.subject).toBe("Notify me weekly report: 3 new requests");
    expect(r.text).toContain("2 x Sandal - Tan / 6");
    expect(renderReportEmail({ ...base, total: 1, rows: [{ item: "Boot", count: 1 }] }).subject).toContain("1 new request");
  });

  it("escapes product names", () => {
    const r = renderReportEmail({ ...base, total: 1, rows: [{ item: "<img src=x onerror=1>", count: 1 }] });
    expect(r.html).not.toContain("<img");
  });

  it("blocks a non-http link", () => {
    expect(renderReportEmail({ ...base, adminUrl: "javascript:alert(1)", total: 1, rows: [] }).html).not.toContain("javascript:");
  });
});
