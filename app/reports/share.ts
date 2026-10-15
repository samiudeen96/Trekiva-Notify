/** A product's part of all requests in the period, as "44%" ("<1%" when tiny, "-" when there are none). */
export function sharePercent(count: number, total: number): string {
  if (total <= 0 || count <= 0) return "-";
  const p = (count / total) * 100;
  if (p < 1) return "<1%";
  return `${Math.round(p)}%`;
}
