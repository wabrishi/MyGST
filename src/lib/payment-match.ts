/**
 * Matching a payment another company says it made to us with one we already recorded by hand,
 * so confirming it doesn't create a duplicate. Pure: works on plain rows.
 */

export const MATCH_WINDOW_DAYS = 10;
const DAY = 86_400_000;

export interface MatchRow {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // paise
  mode: string;
  reference: string;
}

export interface MatchCandidate extends MatchRow {
  sameAmount: boolean;
  /** Our amount minus theirs, in paise. */
  difference: number;
  days: number;
}

/** Same amount first, then the nearest date; payments already matched elsewhere and those outside the window are left out. */
export function rankMatches(rows: MatchRow[], target: { date: string; amount: number }, alreadyMatched: Set<string>, limit = 5): MatchCandidate[] {
  const t = Date.parse(target.date + "T00:00:00Z");
  return rows
    .filter((r) => !alreadyMatched.has(r.id))
    .map((r) => ({ ...r, sameAmount: r.amount === target.amount, difference: r.amount - target.amount, days: Math.round(Math.abs(Date.parse(r.date + "T00:00:00Z") - t) / DAY) }))
    .filter((r) => r.days <= MATCH_WINDOW_DAYS)
    .sort((a, b) => Number(b.sameAmount) - Number(a.sameAmount) || a.days - b.days || Math.abs(a.difference) - Math.abs(b.difference))
    .slice(0, limit);
}
