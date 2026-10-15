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

  it("points to the Excel attachment when there is one", () => {
    const r = renderReportEmail({ ...base, total: 1, rows: [], attachments: [{ name: "report.xlsx", kind: "Excel" }] });
    expect(r.html).toContain("attached Excel file");
    expect(r.text).toContain("attached Excel file");
    expect(renderReportEmail({ ...base, total: 1, rows: [] }).html).not.toContain("attached");
  });

  it("describes a PDF, and both files", () => {
    const pdf = renderReportEmail({ ...base, total: 1, rows: [], attachments: [{ name: "r.pdf", kind: "PDF" }] });
    expect(pdf.text).toContain("attached PDF");
    const both = renderReportEmail({ ...base, total: 1, rows: [], attachments: [{ name: "r.xlsx", kind: "Excel" }, { name: "r.pdf", kind: "PDF" }] });
    expect(both.text).toContain("Excel file");
    expect(both.text).toContain("PDF");
  });

  it("blocks a non-http link", () => {
    expect(renderReportEmail({ ...base, adminUrl: "javascript:alert(1)", total: 1, rows: [] }).html).not.toContain("javascript:");
  });
});
