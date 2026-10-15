import type { FileFormat } from "./export.server";

export type ReportFormat = "EXCEL" | "PDF" | "BOTH";

/** The file types a report email carries for a saved choice. Anything unknown falls back to Excel. */
export function formatsFor(choice: string | null | undefined): FileFormat[] {
  if (choice === "PDF") return ["pdf"];
  if (choice === "BOTH") return ["xlsx", "pdf"];
  return ["xlsx"];
}

export const kindOf = (format: FileFormat): "Excel" | "PDF" => (format === "xlsx" ? "Excel" : "PDF");
