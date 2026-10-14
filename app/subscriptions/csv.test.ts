import { describe, expect, it } from "vitest";
import { csvField, csvRow } from "./csv";

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvField('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  it("defuses spreadsheet formulas", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+1")).toBe("'+1");
  });

  it("writes empty for null and joins a row", () => {
    expect(csvRow(["a", null, 2, true])).toBe("a,,2,true");
  });
});
