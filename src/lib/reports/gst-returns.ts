import "server-only";
import { db } from "../db";
import { isoOf } from "../documents";
import { toPaise } from "../gst/calc";
import { stateName } from "../gst/states";
import { gstDate, rs, type Col } from "./csv";

/** B2CL threshold: inter-state supply to unregistered person with invoice value above ₹1,00,000 (from Aug 2024). */
export const B2CL_LIMIT = 100_000_00;

const P = (v: { toNumber(): number }) => toPaise(v.toNumber());
const pos = (code: string) => `${code}-${stateName(code)}`;
const dateRange = (from: string, to: string) => ({ gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T00:00:00Z") });

interface RateRow {
  rate: number;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
}

/** Groups a document's items by GST rate. */
function byRate(items: Array<{ gstRate: { toNumber(): number }; taxable: { toNumber(): number }; igst: { toNumber(): number }; cgst: { toNumber(): number }; sgst: { toNumber(): number } }>) {
  const m = new Map<number, RateRow>();
  for (const i of items) {
    const rate = i.gstRate.toNumber();
    const r = m.get(rate) ?? { rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    r.taxable += P(i.taxable);
    r.igst += P(i.igst);
    r.cgst += P(i.cgst);
    r.sgst += P(i.sgst);
    m.set(rate, r);
  }
  return [...m.values()];
}

async function loadOutward(companyId: string, from: string, to: string) {
  return db.document.findMany({
    where: { companyId, type: { in: ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] }, date: dateRange(from, to) },
    orderBy: [{ type: "asc" }, { date: "asc" }, { seq: "asc" }],
    include: { items: true, originalDoc: { select: { number: true, date: true, isInterstate: true, partyGstin: true, grandTotal: true } } },
  });
}
type OutDoc = Awaited<ReturnType<typeof loadOutward>>[number];

const isB2CL = (d: { partyGstin: string; isInterstate: boolean; grandTotal: { toNumber(): number } }) =>
  !d.partyGstin && d.isInterstate && P(d.grandTotal) > B2CL_LIMIT;

// ───────────────────────── GSTR-1 ─────────────────────────

export interface B2BRow { gstin: string; name: string; number: string; date: string; value: number; pos: string; reverseCharge: boolean; rate: number; taxable: number; igst: number; cgst: number; sgst: number }
export interface B2CLRow { number: string; date: string; value: number; pos: string; rate: number; taxable: number; igst: number }
export interface B2CSRow { pos: string; rate: number; taxable: number; igst: number; cgst: number; sgst: number }
export interface NoteRow { gstin: string; name: string; number: string; date: string; noteType: "C" | "D"; pos: string; reverseCharge: boolean; value: number; rate: number; taxable: number; igst: number; cgst: number; sgst: number; originalNumber: string; originalDate: string }
export interface HsnRow { type: "B2B" | "B2C"; hsn: string; description: string; uqc: string; qty: number; value: number; rate: number; taxable: number; igst: number; cgst: number; sgst: number }
export interface DocsIssuedRow { nature: string; from: string; to: string; total: number; cancelled: number }

export async function gstr1(companyId: string, from: string, to: string) {
  const docs = await loadOutward(companyId, from, to);
  const live = docs.filter((d) => d.status === "ISSUED");

  const b2b: B2BRow[] = [];
  const b2cl: B2CLRow[] = [];
  const b2csMap = new Map<string, B2CSRow>();
  const cdnr: NoteRow[] = [];
  const cdnur: NoteRow[] = [];
  const hsnMap = new Map<string, HsnRow>();

  const addB2CS = (d: OutDoc, sign: 1 | -1) => {
    for (const r of byRate(d.items)) {
      const key = `${d.placeOfSupply}|${r.rate}`;
      const row = b2csMap.get(key) ?? { pos: d.placeOfSupply, rate: r.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      row.taxable += sign * r.taxable;
      row.igst += sign * r.igst;
      row.cgst += sign * r.cgst;
      row.sgst += sign * r.sgst;
      b2csMap.set(key, row);
    }
  };

  for (const d of live) {
    const registered = !!d.partyGstin;
    const value = P(d.grandTotal);
    const date = isoOf(d.date);

    if (d.type === "INVOICE") {
      if (registered) {
        for (const r of byRate(d.items)) {
          b2b.push({ gstin: d.partyGstin, name: d.partyName, number: d.number, date, value, pos: d.placeOfSupply, reverseCharge: d.reverseCharge, ...r });
        }
      } else if (isB2CL(d)) {
        for (const r of byRate(d.items)) b2cl.push({ number: d.number, date, value, pos: d.placeOfSupply, rate: r.rate, taxable: r.taxable, igst: r.igst });
      } else {
        addB2CS(d, 1);
      }
    } else {
      const noteType = d.type === "CREDIT_NOTE" ? "C" : "D";
      const sign = noteType === "C" ? -1 : 1;
      const base = {
        gstin: d.partyGstin,
        name: d.partyName,
        number: d.number,
        date,
        noteType,
        pos: d.placeOfSupply,
        reverseCharge: d.reverseCharge,
        value,
        originalNumber: d.originalDoc?.number ?? "",
        originalDate: d.originalDoc ? isoOf(d.originalDoc.date) : "",
      } as const;
      if (registered) {
        for (const r of byRate(d.items)) cdnr.push({ ...base, ...r });
      } else if (d.originalDoc && isB2CL({ ...d.originalDoc, partyGstin: "" })) {
        for (const r of byRate(d.items)) cdnur.push({ ...base, ...r });
      } else {
        addB2CS(d, sign); // notes against small B2C invoices are netted into B2CS
      }
    }

    // HSN summary (credit notes reduce, debit notes add).
    const sign = d.type === "CREDIT_NOTE" ? -1 : 1;
    const type = registered ? "B2B" : "B2C";
    for (const i of d.items) {
      const rate = i.gstRate.toNumber();
      const key = `${type}|${i.hsnSac}|${i.unit}|${rate}`;
      const row = hsnMap.get(key) ?? { type, hsn: i.hsnSac, description: i.description, uqc: i.unit, qty: 0, value: 0, rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      row.qty += sign * i.qty.toNumber();
      row.value += sign * P(i.total);
      row.taxable += sign * P(i.taxable);
      row.igst += sign * P(i.igst);
      row.cgst += sign * P(i.cgst);
      row.sgst += sign * P(i.sgst);
      hsnMap.set(key, row);
    }
  }

  // Documents issued (Table 13) — includes cancelled documents.
  const NATURE = { INVOICE: "Invoices for outward supply", CREDIT_NOTE: "Credit Note", DEBIT_NOTE: "Debit Note" } as const;
  const docsIssued: DocsIssuedRow[] = [];
  for (const t of ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] as const) {
    const ofType = docs.filter((d) => d.type === t);
    if (!ofType.length) continue;
    // Separate rows per number series (prefix + FY).
    const series = new Map<string, OutDoc[]>();
    for (const d of ofType) {
      const k = d.number.slice(0, d.number.lastIndexOf("/"));
      series.set(k, [...(series.get(k) ?? []), d]);
    }
    for (const list of series.values()) {
      const sorted = [...list].sort((a, b) => a.seq - b.seq);
      docsIssued.push({
        nature: NATURE[t],
        from: sorted[0].number,
        to: sorted[sorted.length - 1].number,
        total: sorted.length,
        cancelled: sorted.filter((d) => d.status === "CANCELLED").length,
      });
    }
  }

  const b2cs = [...b2csMap.values()].filter((r) => r.taxable !== 0).sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate);
  const hsn = [...hsnMap.values()].sort((a, b) => a.type.localeCompare(b.type) || a.hsn.localeCompare(b.hsn));
  return { b2b, b2cl, b2cs, cdnr, cdnur, hsn, docsIssued };
}

export type Gstr1 = Awaited<ReturnType<typeof gstr1>>;

/** CSV layouts matching the GST offline utility column headers. */
export const GSTR1_CSV: { [K in keyof Gstr1]: { title: string; cols: Col<Gstr1[K][number]>[] } } = {
  b2b: {
    title: "B2B Invoices (4A, 4B, 6B, 6C)",
    cols: [
      { header: "GSTIN/UIN of Recipient", value: (r) => r.gstin },
      { header: "Receiver Name", value: (r) => r.name },
      { header: "Invoice Number", value: (r) => r.number },
      { header: "Invoice date", value: (r) => gstDate(r.date) },
      { header: "Invoice Value", value: (r) => rs(r.value) },
      { header: "Place Of Supply", value: (r) => pos(r.pos) },
      { header: "Reverse Charge", value: (r) => (r.reverseCharge ? "Y" : "N") },
      { header: "Applicable % of Tax Rate", value: () => "" },
      { header: "Invoice Type", value: () => "Regular B2B" },
      { header: "E-Commerce GSTIN", value: () => "" },
      { header: "Rate", value: (r) => r.rate },
      { header: "Taxable Value", value: (r) => rs(r.taxable) },
      { header: "Cess Amount", value: () => "0.00" },
    ],
  },
  b2cl: {
    title: "B2C Large (5A, 5B)",
    cols: [
      { header: "Invoice Number", value: (r) => r.number },
      { header: "Invoice date", value: (r) => gstDate(r.date) },
      { header: "Invoice Value", value: (r) => rs(r.value) },
      { header: "Place Of Supply", value: (r) => pos(r.pos) },
      { header: "Applicable % of Tax Rate", value: () => "" },
      { header: "Rate", value: (r) => r.rate },
      { header: "Taxable Value", value: (r) => rs(r.taxable) },
      { header: "Cess Amount", value: () => "0.00" },
      { header: "E-Commerce GSTIN", value: () => "" },
    ],
  },
  b2cs: {
    title: "B2C Small (7)",
    cols: [
      { header: "Type", value: () => "OE" },
      { header: "Place Of Supply", value: (r) => pos(r.pos) },
      { header: "Applicable % of Tax Rate", value: () => "" },
      { header: "Rate", value: (r) => r.rate },
      { header: "Taxable Value", value: (r) => rs(r.taxable) },
      { header: "Cess Amount", value: () => "0.00" },
      { header: "E-Commerce GSTIN", value: () => "" },
    ],
  },
  cdnr: {
    title: "Credit/Debit Notes – Registered (9B)",
    cols: [
      { header: "GSTIN/UIN of Recipient", value: (r) => r.gstin },
      { header: "Receiver Name", value: (r) => r.name },
      { header: "Note Number", value: (r) => r.number },
      { header: "Note Date", value: (r) => gstDate(r.date) },
      { header: "Note Type", value: (r) => r.noteType },
      { header: "Place Of Supply", value: (r) => pos(r.pos) },
      { header: "Reverse Charge", value: (r) => (r.reverseCharge ? "Y" : "N") },
      { header: "Note Supply Type", value: () => "Regular B2B" },
      { header: "Note Value", value: (r) => rs(r.value) },
      { header: "Applicable % of Tax Rate", value: () => "" },
      { header: "Rate", value: (r) => r.rate },
      { header: "Taxable Value", value: (r) => rs(r.taxable) },
      { header: "Cess Amount", value: () => "0.00" },
    ],
  },
  cdnur: {
    title: "Credit/Debit Notes – Unregistered (9B)",
    cols: [
      { header: "UR Type", value: () => "B2CL" },
      { header: "Note Number", value: (r) => r.number },
      { header: "Note Date", value: (r) => gstDate(r.date) },
      { header: "Note Type", value: (r) => r.noteType },
      { header: "Place Of Supply", value: (r) => pos(r.pos) },
      { header: "Note Value", value: (r) => rs(r.value) },
      { header: "Applicable % of Tax Rate", value: () => "" },
      { header: "Rate", value: (r) => r.rate },
      { header: "Taxable Value", value: (r) => rs(r.taxable) },
      { header: "Cess Amount", value: () => "0.00" },
    ],
  },
  hsn: {
    title: "HSN-wise summary (12)",
    cols: [
      { header: "Type", value: (r) => r.type },
      { header: "HSN", value: (r) => r.hsn },
      { header: "Description", value: (r) => r.description },
      { header: "UQC", value: (r) => r.uqc },
      { header: "Total Quantity", value: (r) => Number(r.qty.toFixed(3)) },
      { header: "Total Value", value: (r) => rs(r.value) },
      { header: "Rate", value: (r) => r.rate },
      { header: "Taxable Value", value: (r) => rs(r.taxable) },
      { header: "Integrated Tax Amount", value: (r) => rs(r.igst) },
      { header: "Central Tax Amount", value: (r) => rs(r.cgst) },
      { header: "State/UT Tax Amount", value: (r) => rs(r.sgst) },
      { header: "Cess Amount", value: () => "0.00" },
    ],
  },
  docsIssued: {
    title: "Documents issued (13)",
    cols: [
      { header: "Nature of Document", value: (r) => r.nature },
      { header: "Sr. No. From", value: (r) => r.from },
      { header: "Sr. No. To", value: (r) => r.to },
      { header: "Total Number", value: (r) => r.total },
      { header: "Cancelled", value: (r) => r.cancelled },
    ],
  },
};

// ───────────────────────── GSTR-3B ─────────────────────────

export interface TaxBucket {
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
}
const zero = (): TaxBucket => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });
const addTo = (b: TaxBucket, i: { taxable: { toNumber(): number }; igst: { toNumber(): number }; cgst: { toNumber(): number }; sgst: { toNumber(): number } }, sign = 1) => {
  b.taxable += sign * P(i.taxable);
  b.igst += sign * P(i.igst);
  b.cgst += sign * P(i.cgst);
  b.sgst += sign * P(i.sgst);
};

export async function gstr3b(companyId: string, from: string, to: string) {
  const [docs, bills] = await Promise.all([
    loadOutward(companyId, from, to),
    db.purchaseBill.findMany({ where: { companyId, cancelled: false, billDate: dateRange(from, to) }, include: { items: true } }),
  ]);

  const outward = zero(); // 3.1(a) taxable outward (other than zero/nil/exempt)
  const nilExempt = zero(); // 3.1(c) nil-rated / exempt
  const outwardRcm = zero(); // supplies where recipient pays tax (excluded from our liability)
  for (const d of docs) {
    if (d.status !== "ISSUED") continue;
    const sign = d.type === "CREDIT_NOTE" ? -1 : 1;
    for (const i of d.items) {
      if (i.gstRate.toNumber() === 0) addTo(nilExempt, i, sign);
      else if (d.reverseCharge) addTo(outwardRcm, i, sign);
      else addTo(outward, i, sign);
    }
  }

  const inwardRcm = zero(); // 3.1(d) inward supplies liable to reverse charge
  const itcEligible = zero(); // 4(A)(5) all other ITC (+ 4(A)(3) for RCM)
  const itcIneligible = zero(); // 4(D) ineligible
  for (const b of bills) {
    for (const i of b.items) {
      if (b.reverseCharge) addTo(inwardRcm, i);
      if (b.itcType === "INELIGIBLE") addTo(itcIneligible, i);
      else if (b.partyGstin || b.reverseCharge) addTo(itcEligible, i);
    }
  }

  const liability = { igst: outward.igst + inwardRcm.igst, cgst: outward.cgst + inwardRcm.cgst, sgst: outward.sgst + inwardRcm.sgst };
  const net = { igst: liability.igst - itcEligible.igst, cgst: liability.cgst - itcEligible.cgst, sgst: liability.sgst - itcEligible.sgst };
  return { outward, nilExempt, outwardRcm, inwardRcm, itcEligible, itcIneligible, liability, net };
}
