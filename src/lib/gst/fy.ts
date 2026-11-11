/** Indian financial year helpers. Dates are ISO strings "YYYY-MM-DD". */

const startYear = (date: string) => {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 4 ? y : y - 1;
};

/** "2026-11-11" -> "26-27" */
export function financialYear(date: string): string {
  const s = startYear(date);
  return `${String(s).slice(2)}-${String(s + 1).slice(2)}`;
}

/** First and last day of the financial year containing `date`. */
export function financialYearRange(date: string): [string, string] {
  const s = startYear(date);
  return [`${s}-04-01`, `${s + 1}-03-31`];
}

export function monthRange(date: string): [string, string] {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return [`${y}-${mm}-01`, `${y}-${mm}-${String(last).padStart(2, "0")}`];
}

/** Today's date in India (IST), as YYYY-MM-DD, regardless of server timezone. */
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export const isIsoDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z"));

/**
 * Last date to issue a credit note for an invoice (Sec 34): 30 November following the end of
 * the financial year of the invoice (or annual return filing, if earlier — not modelled).
 */
export function creditNoteDeadline(invoiceDate: string): string {
  return `${startYear(invoiceDate) + 1}-11-30`;
}

/** Document numbering: PREFIX + FY + "/" + 4-digit seq, max 16 chars as required by GST rules. */
export const MAX_DOC_NUMBER_LENGTH = 16;
export const PREFIX_PATTERN = /^[A-Z0-9/-]{0,6}$/;

export function formatDocNumber(prefix: string, fy: string, seq: number): string {
  const n = `${prefix}${fy}/${String(seq).padStart(4, "0")}`;
  if (n.length > MAX_DOC_NUMBER_LENGTH) throw new Error(`Document number "${n}" exceeds 16 characters`);
  return n;
}
