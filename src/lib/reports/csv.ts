export type Col<T> = { header: string; value: (row: T) => string | number };

const esc = (v: string | number) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC-4180 CSV with BOM so Excel opens UTF-8 (₹, Hindi names) correctly. */
export function toCsv<T>(rows: T[], cols: Col<T>[]) {
  const lines = [cols.map((c) => esc(c.header)).join(","), ...rows.map((r) => cols.map((c) => esc(c.value(r))).join(","))];
  return "﻿" + lines.join("\r\n");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** GST offline-tool date format: 11-Nov-2026 */
export const gstDate = (iso: string) => `${iso.slice(8, 10)}-${MONTHS[Number(iso.slice(5, 7)) - 1]}-${iso.slice(0, 4)}`;
/** Paise -> "1234.50" */
export const rs = (paise: number) => (paise / 100).toFixed(2);
