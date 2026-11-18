/**
 * Purchase-order billing maths (pure; shared by server and client). Quantities have 3 decimals, so
 * they're compared in thousandths to avoid floating-point noise.
 */

export type PoStatus = "OPEN" | "PARTIAL" | "BILLED" | "CLOSED" | "CANCELLED";

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  OPEN: "Open",
  PARTIAL: "Partly billed",
  BILLED: "Billed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const milli = (n: number) => Math.round(n * 1000);

/** Quantity still to be billed on a line (never negative). */
export const remainingQty = (qty: number, billedQty: number) => Math.max(0, milli(qty) - milli(billedQty)) / 1000;

/** Status from the lines' billed quantities. CANCELLED and CLOSED are decisions, so they're kept. */
export function derivePoStatus(current: PoStatus, lines: Array<{ qty: number; billedQty: number }>): PoStatus {
  if (current === "CANCELLED" || current === "CLOSED") return current;
  if (!lines.length) return "OPEN";
  if (lines.every((l) => milli(l.billedQty) >= milli(l.qty))) return "BILLED";
  if (lines.some((l) => milli(l.billedQty) > 0)) return "PARTIAL";
  return "OPEN";
}

/** Share billed by value of ordered quantity, 0–100 (for the list's progress column). */
export function billedPercent(lines: Array<{ qty: number; billedQty: number }>) {
  const ordered = lines.reduce((s, l) => s + milli(l.qty), 0);
  if (!ordered) return 0;
  const billed = lines.reduce((s, l) => s + Math.min(milli(l.billedQty), milli(l.qty)), 0);
  return Math.round((billed / ordered) * 100);
}

/** Open (or partly billed) orders past their expected delivery date. */
export const isOverdue = (status: PoStatus, expectedDate: string | null, today: string) =>
  (status === "OPEN" || status === "PARTIAL") && !!expectedDate && expectedDate < today;
