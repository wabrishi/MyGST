/**
 * GST calculation engine. All money results are integer PAISE to avoid floating point drift.
 * Inputs (qty, rate, percentages) are ordinary numbers as typed by the user.
 */

/** Common slabs: current (post Sept-2025) 0/0.25/3/5/18/40 plus legacy 12 and 28. */
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40] as const;

export const UNITS = [
  "NOS", "PCS", "KGS", "GMS", "LTR", "MLT", "MTR", "SQM", "BOX", "SET", "PAC", "DOZ", "BAG", "BTL", "ROL", "HRS", "OTH",
] as const;

export interface LineInput {
  qty: number;
  rate: number;
  discountPct?: number;
  gstRate: number;
}

export interface LineAmounts {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface CalcOptions {
  interstate: boolean;
  /** When true, `rate` already includes GST and taxable value is back-calculated. */
  pricesIncludeTax?: boolean;
}

/** Rupees (float) -> paise (int), robust against binary float artefacts like 1.005*100 = 100.4999… */
export const toPaise = (rupees: number) => Math.round(Number((Number(rupees) * 100).toFixed(6)));
export const fromPaise = (paise: number) => paise / 100;

const finite = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function calcLine(line: LineInput, opts: CalcOptions): LineAmounts {
  const qty = finite(line.qty);
  const rate = finite(line.rate);
  const disc = finite(line.discountPct);
  const gst = finite(line.gstRate);

  const gross = qty * rate * (1 - disc / 100);
  const taxable = toPaise(opts.pricesIncludeTax ? gross / (1 + gst / 100) : gross);

  let cgst = 0, sgst = 0, igst = 0;
  if (opts.interstate) {
    igst = Math.round((taxable * gst) / 100);
  } else {
    cgst = Math.round((taxable * gst) / 200);
    sgst = cgst;
  }
  return { taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst };
}

export interface DocTotals {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** Sum before rounding to rupee. */
  exact: number;
  roundOff: number;
  grandTotal: number;
}

export function calcDocument<T extends LineInput>(lines: T[], opts: CalcOptions & { roundToRupee?: boolean }) {
  const computed = lines.map((l) => ({ ...l, ...calcLine(l, opts) }));
  const sum = (k: keyof LineAmounts) => computed.reduce((a, l) => a + l[k], 0);
  const taxable = sum("taxable");
  const cgst = sum("cgst");
  const sgst = sum("sgst");
  const igst = sum("igst");
  const exact = taxable + cgst + sgst + igst;
  const grandTotal = opts.roundToRupee === false ? exact : Math.round(exact / 100) * 100;
  const totals: DocTotals = { taxable, cgst, sgst, igst, exact, roundOff: grandTotal - exact, grandTotal };
  return { lines: computed, totals };
}

export interface TaxSummaryRow extends Omit<LineAmounts, "total"> {
  hsnSac: string;
  gstRate: number;
}

/** HSN/SAC + rate wise breakup printed at the bottom of invoices. */
export function taxSummary(lines: Array<LineAmounts & { hsnSac?: string; gstRate: number }>): TaxSummaryRow[] {
  const map = new Map<string, TaxSummaryRow>();
  for (const l of lines) {
    const hsnSac = l.hsnSac || "-";
    const key = `${hsnSac}|${l.gstRate}`;
    const row = map.get(key) ?? { hsnSac, gstRate: l.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    row.taxable += l.taxable;
    row.cgst += l.cgst;
    row.sgst += l.sgst;
    row.igst += l.igst;
    map.set(key, row);
  }
  return [...map.values()];
}

const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 12345678 paise -> "1,23,456.78" */
export const formatPaise = (paise: number) => INR.format(paise / 100);
export const formatINR = (paise: number) => "₹" + INR.format(paise / 100);
