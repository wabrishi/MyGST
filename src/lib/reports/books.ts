import "server-only";
import { db } from "../db";
import { kindOfType } from "../doc-kinds";
import { isoOf } from "../documents";
import { toPaise } from "../gst/calc";
import { todayIST } from "../gst/fy";
import { openPayables, openReceivables } from "../payments";

const P = (v: { toNumber(): number }) => toPaise(v.toNumber());
const range = (from: string, to: string) => ({ gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T00:00:00Z") });

// ───────────────────────── Party ledger ─────────────────────────

export interface LedgerEntry {
  date: string;
  kind: string;
  ref: string;
  href: string | null;
  debit: number; // party owes us more
  credit: number; // party owes us less
  balance: number;
}

/**
 * Party ledger (from our books' perspective; positive balance = receivable / Dr).
 * Dr: invoices, debit notes, payments made to party.  Cr: credit notes, purchase bills, payments received.
 * Opening = party opening balance + everything dated before `from` — so balances carry across financial years.
 */
export async function partyLedger(companyId: string, partyId: string, from: string, to: string) {
  const party = await db.party.findFirst({ where: { id: partyId, companyId } });
  if (!party) return null;
  const [docs, bills, payments] = await Promise.all([
    db.document.findMany({
      where: { companyId, partyId, status: "ISSUED", type: { in: ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"] }, date: { lte: new Date(to + "T00:00:00Z") } },
      select: { id: true, type: true, number: true, date: true, grandTotal: true },
    }),
    db.purchaseBill.findMany({
      where: { companyId, partyId, cancelled: false, billDate: { lte: new Date(to + "T00:00:00Z") } },
      select: { id: true, billNumber: true, billDate: true, grandTotal: true },
    }),
    db.payment.findMany({
      where: { companyId, partyId, date: { lte: new Date(to + "T00:00:00Z") } },
      select: { id: true, direction: true, date: true, amount: true, mode: true, reference: true },
    }),
  ]);

  const base = `/c/${companyId}`;
  type Raw = Omit<LedgerEntry, "balance">;
  const raw: Raw[] = [
    ...docs.map((d) => ({
      date: isoOf(d.date),
      kind: d.type === "INVOICE" ? "Invoice" : d.type === "DEBIT_NOTE" ? "Debit note" : "Credit note",
      ref: d.number,
      href: `${base}/${kindOfType(d.type)}/${d.id}`,
      debit: d.type === "CREDIT_NOTE" ? 0 : P(d.grandTotal),
      credit: d.type === "CREDIT_NOTE" ? P(d.grandTotal) : 0,
    })),
    ...bills.map((b) => ({ date: isoOf(b.billDate), kind: "Purchase", ref: b.billNumber, href: `${base}/purchases/${b.id}`, debit: 0, credit: P(b.grandTotal) })),
    ...payments.map((p) => ({
      date: isoOf(p.date),
      kind: p.direction === "RECEIVED" ? `Receipt (${p.mode})` : `Payment (${p.mode})`,
      ref: p.reference,
      href: `${base}/payments/${p.id}`,
      debit: p.direction === "PAID" ? P(p.amount) : 0,
      credit: p.direction === "RECEIVED" ? P(p.amount) : 0,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let opening = P(party.openingBalance);
  const entries: LedgerEntry[] = [];
  let balance = 0;
  for (const r of raw) {
    if (r.date < from) {
      opening += r.debit - r.credit;
      continue;
    }
    if (entries.length === 0) balance = opening;
    balance += r.debit - r.credit;
    entries.push({ ...r, balance });
  }
  const totals = entries.reduce((t, e) => ({ debit: t.debit + e.debit, credit: t.credit + e.credit }), { debit: 0, credit: 0 });
  return { party, opening, entries, totals, closing: opening + totals.debit - totals.credit };
}

// ───────────────────────── Ageing ─────────────────────────

export const AGE_BUCKETS = ["Not due", "0–30", "31–60", "61–90", "90+"] as const;

export async function ageing(companyId: string, side: "receivable" | "payable", asOf = todayIST()) {
  const items = side === "receivable" ? await openReceivables(db, companyId) : await openPayables(db, companyId);
  const ids = [...new Set(items.map((i) => i.id))];
  // Map each open item to its party.
  const owners =
    side === "receivable"
      ? await db.document.findMany({ where: { id: { in: ids } }, select: { id: true, partyId: true, partyName: true } })
      : await db.purchaseBill.findMany({ where: { id: { in: ids } }, select: { id: true, partyId: true, partyName: true } });
  const ownerOf = new Map(owners.map((o) => [o.id, o]));

  const parties = new Map<string, { partyId: string; name: string; buckets: number[]; total: number }>();
  const asOfMs = Date.parse(asOf + "T00:00:00Z");
  for (const i of items) {
    const o = ownerOf.get(i.id)!;
    const due = i.dueDate || i.date;
    const days = Math.floor((asOfMs - Date.parse(due + "T00:00:00Z")) / 86_400_000);
    const b = days < 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
    const row = parties.get(o.partyId) ?? { partyId: o.partyId, name: o.partyName, buckets: [0, 0, 0, 0, 0], total: 0 };
    row.buckets[b] += i.balance;
    row.total += i.balance;
    parties.set(o.partyId, row);
  }
  const rows = [...parties.values()].sort((a, b) => b.total - a.total);
  const totals = rows.reduce((t, r) => r.buckets.map((v, k) => t[k] + v), [0, 0, 0, 0, 0]);
  return { rows, totals, grand: totals.reduce((a, b) => a + b, 0) };
}

// ───────────────────────── Registers ─────────────────────────

export async function salesRegister(companyId: string, from: string, to: string) {
  const docs = await db.document.findMany({
    where: { companyId, type: { in: ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] }, date: range(from, to) },
    orderBy: [{ date: "asc" }, { type: "asc" }, { seq: "asc" }],
  });
  return docs.map((d) => {
    const sign = d.type === "CREDIT_NOTE" ? -1 : 1;
    const live = d.status === "ISSUED" ? sign : 0;
    return {
      id: d.id,
      type: d.type,
      date: isoOf(d.date),
      number: d.number,
      party: d.partyName,
      gstin: d.partyGstin,
      pos: d.placeOfSupply,
      status: d.status,
      taxable: live * P(d.taxableTotal),
      cgst: live * P(d.cgst),
      sgst: live * P(d.sgst),
      igst: live * P(d.igst),
      total: live * P(d.grandTotal),
    };
  });
}

export async function purchaseRegister(companyId: string, from: string, to: string) {
  const bills = await db.purchaseBill.findMany({ where: { companyId, billDate: range(from, to) }, orderBy: { billDate: "asc" } });
  return bills.map((b) => {
    const live = b.cancelled ? 0 : 1;
    return {
      id: b.id,
      date: isoOf(b.billDate),
      number: b.billNumber,
      party: b.partyName,
      gstin: b.partyGstin,
      itc: b.itcType,
      reverseCharge: b.reverseCharge,
      cancelled: b.cancelled,
      taxable: live * P(b.taxableTotal),
      cgst: live * P(b.cgst),
      sgst: live * P(b.sgst),
      igst: live * P(b.igst),
      total: live * P(b.grandTotal),
    };
  });
}
