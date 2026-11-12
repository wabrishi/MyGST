import "server-only";
import { db } from "../db";
import { isoOf } from "../documents";
import { toPaise } from "../gst/calc";
import { todayIST } from "../gst/fy";
import { stateName } from "../gst/states";
import { openPayables, openReceivables } from "../payments";
import { ageing } from "./books";
import { growthPct, prevMonthKey, ratePct, weightedAgeDays } from "./kpi-math";

const P = (v: { toNumber(): number } | null | undefined) => toPaise(v?.toNumber() ?? 0);
const day = (iso: string) => new Date(iso + "T00:00:00Z");
/** One FY month; null = month not reached yet. Values in rupees. */
export type MonthRow = {
  month: string;
  sales: number | null;
  purchases: number | null;
  invoiced: number | null;
  collected: number | null;
  outputTax: number | null;
  itc: number | null;
  netGst: number | null;
};

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

/**
 * Dashboard KPIs for one company and financial year (`from`–`to`). Sales figures net off credit
 * notes and add debit notes; cancelled documents are excluded. Receivables/payables are all-time.
 */
export async function dashboardKpis(companyId: string, from: string, to: string) {
  const range = { gte: day(from), lte: day(to) };
  const today = todayIST();

  const [docs, bills, receipts, quotes, receivables, payables, topCustomers, topProducts, ageingData, rates] = await Promise.all([
    db.document.findMany({
      where: { companyId, status: "ISSUED", type: { in: ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] }, date: range },
      select: { type: true, date: true, partyId: true, partyGstin: true, placeOfSupply: true, taxableTotal: true, cgst: true, sgst: true, igst: true, grandTotal: true },
    }),
    db.purchaseBill.findMany({
      where: { companyId, cancelled: false, billDate: range },
      select: { billDate: true, taxableTotal: true, cgst: true, sgst: true, igst: true, itcType: true, partyGstin: true, reverseCharge: true },
    }),
    db.payment.findMany({ where: { companyId, direction: "RECEIVED", date: range }, select: { date: true, amount: true } }),
    db.document.groupBy({ by: ["status"], where: { companyId, type: "QUOTATION", date: range }, _count: true }),
    openReceivables(db, companyId),
    openPayables(db, companyId),
    db.document.groupBy({
      by: ["partyId", "partyName"],
      where: { companyId, type: "INVOICE", status: "ISSUED", date: range },
      _sum: { grandTotal: true },
      _count: true,
      orderBy: { _sum: { grandTotal: "desc" } },
      take: 5,
    }),
    db.documentItem.groupBy({
      by: ["description"],
      where: { document: { companyId, type: "INVOICE", status: "ISSUED", date: range } },
      _sum: { taxable: true, qty: true },
      orderBy: { _sum: { taxable: "desc" } },
      take: 5,
    }),
    ageing(companyId, "receivable", today),
    db.documentItem.groupBy({
      by: ["gstRate"],
      where: { document: { companyId, type: "INVOICE", status: "ISSUED", date: range } },
      _sum: { taxable: true },
      orderBy: { _sum: { taxable: "desc" } },
    }),
  ]);

  // ── Sales ──
  const monthly = MONTHS.map((month) => ({ month, sales: 0, purchases: 0, invoiced: 0, collected: 0, outputTax: 0, itc: 0, netGst: 0 }));
  const mIdx = (iso: string) => (Number(iso.slice(5, 7)) + 8) % 12;
  const byState = new Map<string, number>();
  const byMonth = new Map<string, number>();
  let taxable = 0, gross = 0, outputTax = 0, invoiceCount = 0, invoiceGross = 0, creditNotes = 0;
  const customers = new Set<string>();
  let b2b = 0, b2c = 0;
  for (const d of docs) {
    const sign = d.type === "CREDIT_NOTE" ? -1 : 1;
    const t = sign * P(d.taxableTotal);
    const iso = isoOf(d.date);
    taxable += t;
    gross += sign * P(d.grandTotal);
    const tax = sign * (P(d.cgst) + P(d.sgst) + P(d.igst));
    outputTax += tax;
    const row = monthly[mIdx(iso)];
    row.sales += t / 100;
    row.outputTax += tax / 100;
    byMonth.set(iso.slice(0, 7), (byMonth.get(iso.slice(0, 7)) ?? 0) + t);
    if (d.type === "INVOICE") {
      invoiceCount++;
      invoiceGross += P(d.grandTotal);
      row.invoiced += P(d.grandTotal) / 100;
      byState.set(d.placeOfSupply, (byState.get(d.placeOfSupply) ?? 0) + P(d.taxableTotal));
      customers.add(d.partyId);
      if (d.partyGstin) b2b += P(d.taxableTotal);
      else b2c += P(d.taxableTotal);
    }
    if (d.type === "CREDIT_NOTE") creditNotes += P(d.grandTotal);
  }
  const thisMonthKey = today.slice(0, 7);
  const inThisFy = today >= from && today <= to;
  const thisMonth = inThisFy ? (byMonth.get(thisMonthKey) ?? 0) : null;
  const lastMonth = inThisFy ? (byMonth.get(prevMonthKey(today)) ?? 0) : null;

  // ── Purchases / ITC ──
  let purchases = 0, purchaseTax = 0, itc = 0;
  for (const b of bills) {
    const tax = P(b.cgst) + P(b.sgst) + P(b.igst);
    purchases += P(b.taxableTotal);
    purchaseTax += tax;
    const row = monthly[mIdx(isoOf(b.billDate))];
    row.purchases += P(b.taxableTotal) / 100;
    if (b.itcType !== "INELIGIBLE" && (b.partyGstin || b.reverseCharge)) {
      itc += tax;
      row.itc += tax / 100;
    }
  }

  // ── Receivables / collections ──
  const receivable = receivables.reduce((s, r) => s + r.balance, 0);
  const overdueItems = receivables.filter((r) => r.dueDate && r.dueDate < today);
  const overdue = overdueItems.reduce((s, r) => s + r.balance, 0);
  const payable = payables.reduce((s, r) => s + r.balance, 0);
  let collected = 0;
  for (const r of receipts) {
    collected += P(r.amount);
    monthly[mIdx(isoOf(r.date))].collected += P(r.amount) / 100;
  }
  // Months after today (current FY) or a whole future FY have no data yet: null, so charts don't show fake zeros.
  const futureFrom = today < from ? 0 : today > to ? 12 : mIdx(today) + 1;
  for (const m of monthly) {
    m.netGst = Math.round((m.outputTax - m.itc) * 100) / 100;
    for (const key of ["sales", "purchases", "invoiced", "collected", "outputTax", "itc"] as const) m[key] = Math.round(m[key] * 100) / 100;
  }

  const monthlySeries: MonthRow[] = monthly.map((m, i) =>
    i >= futureFrom ? { month: m.month, sales: null, purchases: null, invoiced: null, collected: null, outputTax: null, itc: null, netGst: null } : m,
  );

  // Sales by place of supply: top 5 states, the rest folded into "Other".
  const states = [...byState.entries()].sort((a, b) => b[1] - a[1]);
  const salesByState = states.slice(0, 5).map(([code, value]) => ({ code, label: stateName(code) || code, value }));
  const rest = states.slice(5).reduce((s2, [, v]) => s2 + v, 0);
  if (rest > 0) salesByState.push({ code: "other", label: "Other states", value: rest });

  // ── Quotations ──
  const qCount = (s: string) => quotes.find((q) => q.status === s)?._count ?? 0;
  const quotesTotal = quotes.reduce((s, q) => s + q._count, 0);
  const quotesWon = qCount("CONVERTED") + qCount("ACCEPTED");

  return {
    monthly: monthlySeries,
    sales: { taxable, gross, thisMonth, lastMonth, momPct: thisMonth != null && lastMonth != null ? growthPct(thisMonth, lastMonth) : null },
    gst: { output: outputTax, itc, net: outputTax - itc },
    invoices: { count: invoiceCount, avg: invoiceCount ? Math.round(invoiceGross / invoiceCount) : 0 },
    collections: { received: collected, ratePct: ratePct(collected, invoiceGross) },
    receivables: { total: receivable, overdue, overdueCount: overdueItems.length, avgAgeDays: weightedAgeDays(receivables, today) },
    payables: { total: payable, count: payables.length },
    purchases: { taxable: purchases, tax: purchaseTax },
    quotations: { total: quotesTotal, won: quotesWon, conversionPct: ratePct(quotesWon, quotesTotal) },
    returns: { creditNotes, pct: ratePct(creditNotes, invoiceGross) },
    customers: { active: customers.size, b2bPct: ratePct(b2b, b2b + b2c) },
    topCustomers: topCustomers.map((c) => ({ partyId: c.partyId, name: c.partyName, total: P(c._sum.grandTotal), invoices: c._count })),
    topProducts: topProducts.map((p) => ({ name: p.description, taxable: P(p._sum.taxable), qty: p._sum.qty?.toNumber() ?? 0 })),
    salesByRate: rates.map((r) => ({ rate: r.gstRate.toNumber(), value: P(r._sum.taxable) })).filter((r) => r.value !== 0),
    salesByState,
    ageing: { labels: ["Not due", "0–30 days", "31–60 days", "61–90 days", "90+ days"], totals: ageingData.totals, grand: ageingData.grand },
  };
}

export type DashboardKpis = Awaited<ReturnType<typeof dashboardKpis>>;
