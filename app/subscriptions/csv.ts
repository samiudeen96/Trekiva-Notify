/** One CSV field. A leading = + - @ would run as a formula when the file is opened in a spreadsheet. */
export function csvField(value: string | number | boolean | null | undefined): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: (string | number | boolean | null | undefined)[]): string {
  return values.map(csvField).join(",");
}
