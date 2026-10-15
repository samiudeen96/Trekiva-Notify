/** Colours shared by the Excel and PDF reports, so both look like the same product. Hex without "#". */
export const PALETTE = {
  ink: "111827",
  inkSoft: "9CA3AF",
  white: "FFFFFF",
  border: "E1E3E5",
  zebra: "FAFAFB",
  text: "202223",
  muted: "6D7175",
  green: "008060",
  blue: "2C6ECB",
  danger: "A8200A",
} as const;

export const STATUS_STYLE = {
  PENDING: { label: "Pending", fill: "E5F0FF", font: "1D4E9E" },
  NOTIFIED: { label: "Notified", fill: "E3F5EC", font: "006B4F" },
  UNSUBSCRIBED: { label: "Unsubscribed", fill: "F1F1F1", font: "5C5F62" },
  FAILED: { label: "Failed", fill: "FDE8E4", font: "A8200A" },
} as const;

/** The six summary cards, in order: new, pending, notified, unsubscribed, failed, revenue. */
export const KPI_STYLE = [
  { fill: "E3F5EC", font: "006B4F" },
  { fill: "E5F0FF", font: "1D4E9E" },
  { fill: "FFF3D6", font: "8A6100" },
  { fill: "F1F1F1", font: "5C5F62" },
  { fill: "FDE8E4", font: "A8200A" },
  { fill: "E3F5EC", font: "006B4F" },
] as const;

export const argb = (hex: string) => `FF${hex}`;
export const hash = (hex: string) => `#${hex}`;

export const KPI_LABELS = ["New requests", "Pending", "Notified", "Unsubscribed", "Failed", "Revenue converted"] as const;
