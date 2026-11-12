/** Pure KPI formulas (unit-tested). Money is in paise; results are plain numbers or null when undefined. */

/** Percentage change from `prev` to `curr`; null when there is no baseline. */
export function growthPct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

/** Share as a percentage (0–100); null when the denominator is zero. */
export function ratePct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return (part / whole) * 100;
}

/**
 * Days sales outstanding: how many days of credit sales are still unpaid.
 *   DSO = receivable ÷ credit sales in the period × days in the period
 */
export function dso(receivable: number, salesInPeriod: number, daysInPeriod: number): number | null {
  if (salesInPeriod <= 0 || daysInPeriod <= 0) return null;
  return Math.round((receivable / salesInPeriod) * daysInPeriod);
}

/**
 * Average age (days since document date) of unpaid documents, weighted by their unpaid balance.
 * Unlike period-based DSO this is accurate for new businesses with little history.
 */
export function weightedAgeDays(items: Array<{ date: string; balance: number }>, today: string): number | null {
  const total = items.reduce((s, i) => s + i.balance, 0);
  if (total <= 0) return null;
  const t = Date.parse(today + "T00:00:00Z");
  const weighted = items.reduce((s, i) => s + i.balance * Math.max(0, (t - Date.parse(i.date + "T00:00:00Z")) / 86_400_000), 0);
  return Math.round(weighted / total);
}

/** Inclusive day count between two ISO dates, clipped so `to` is not after `cap`. */
export function daysBetween(from: string, to: string, cap?: string): number {
  const end = cap && cap < to ? cap : to;
  if (end < from) return 0;
  return Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000) + 1;
}

/** Previous calendar month of an ISO date, as YYYY-MM. */
export function prevMonthKey(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export const fmtPct = (v: number | null, digits = 0) => (v == null ? "—" : `${v.toFixed(digits)}%`);
