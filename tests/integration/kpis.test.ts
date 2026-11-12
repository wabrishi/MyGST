import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveDocument } from "@/lib/documents";
import { financialYearRange, todayIST } from "@/lib/gst/fy";
import { savePayment } from "@/lib/payments";
import { savePurchase } from "@/lib/purchases";
import { dashboardKpis } from "@/lib/reports/kpis";
import type { CompanyContext } from "@/lib/tenant";

/**
 * Builds a small, fully known set of books through the real services and checks every KPI.
 *   Invoice A  B2B (registered)   2 × ₹1,000 @18%  -> taxable 2,000  total 2,360
 *   Invoice B  B2C (unregistered) 1 × ₹500  @18%   -> taxable   500  total   590
 *   Credit note against A: 1 × ₹1,000 @18%         -> taxable 1,000  total 1,180
 *   Payment received ₹590 against B (B fully paid)
 *   Quotations: 2 (1 converted into invoice B is not modelled here — 1 accepted, 1 open)
 *   Purchase: 1 × ₹400 @18% from a registered supplier -> ITC 72
 */
describe("dashboard KPIs", () => {
  let ctx: CompanyContext;
  const today = todayIST();
  const [from, to] = financialYearRange(today);

  beforeAll(async () => {
    const user = await db.user.create({ data: { id: `kpi-${Date.now()}`, name: "KPI Tester", email: `kpi-${Date.now()}@test.local` } });
    const company = await db.company.create({ data: { legalName: "KPI Co", stateCode: "27" } });
    await db.membership.create({ data: { userId: user.id, companyId: company.id, role: "OWNER" } });
    ctx = {
      user: { id: user.id, name: user.name, email: user.email },
      companyId: company.id,
      role: "OWNER",
      company: { id: company.id, legalName: "KPI Co", tradeName: "", stateCode: "27", gstin: "" },
    };
    const reg = await db.party.create({ data: { companyId: company.id, name: "Registered Buyer", gstin: "27AAPFU0939F1ZV", stateCode: "27" } });
    const walkIn = await db.party.create({ data: { companyId: company.id, name: "Walk-in", stateCode: "27" } });
    const supplier = await db.party.create({ data: { companyId: company.id, name: "Supplier", gstin: "27AAPFU0939F1ZV", stateCode: "27", type: "SUPPLIER" } });
    const line = (description: string, qty: number, rate: number) => ({ description, qty, rate, gstRate: 18, hsnSac: "8471" });
    const doc = (partyId: string, items: ReturnType<typeof line>[], extra = {}) => ({ partyId, date: today, placeOfSupply: "27", items, ...extra });

    const invA = await saveDocument(ctx, "INVOICE", null, doc(reg.id, [line("Widget", 2, 1000)]));
    const invB = await saveDocument(ctx, "INVOICE", null, doc(walkIn.id, [line("Gadget", 1, 500)]));
    await saveDocument(ctx, "CREDIT_NOTE", null, doc(reg.id, [line("Widget", 1, 1000)], { originalDocId: invA, noteReason: "Sales Return" }));
    const q1 = await saveDocument(ctx, "QUOTATION", null, doc(reg.id, [line("Widget", 1, 1000)]));
    await saveDocument(ctx, "QUOTATION", null, doc(walkIn.id, [line("Gadget", 1, 500)]));
    await db.document.update({ where: { id: q1 }, data: { status: "ACCEPTED" } });
    await savePayment(ctx, { direction: "RECEIVED", partyId: walkIn.id, date: today, amount: 590, mode: "UPI", allocations: [{ targetId: invB, amount: 590 }] });
    await savePurchase(ctx, null, { partyId: supplier.id, billNumber: "S-1", billDate: today, placeOfSupply: "27", items: [line("Parts", 1, 400)] });
  });

  afterAll(async () => {
    // Children first: payments/notes deliberately block deleting the documents they reference.
    const where = { companyId: ctx.companyId };
    await db.payment.deleteMany({ where });
    await db.document.deleteMany({ where: { ...where, originalDocId: { not: null } } });
    await db.document.deleteMany({ where });
    await db.purchaseBill.deleteMany({ where });
    await db.company.delete({ where: { id: ctx.companyId } });
    await db.user.delete({ where: { id: ctx.user.id } });
    await db.$disconnect();
  });

  it("computes sales, GST, collections, receivables and rates", async () => {
    const k = await dashboardKpis(ctx.companyId, from, to);

    // Sales net of the credit note: 2,000 + 500 − 1,000
    expect(k.sales.taxable).toBe(1_500_00);
    // Output tax: 360 + 90 − 180 = 270; ITC 72
    expect(k.gst).toEqual({ output: 270_00, itc: 72_00, net: 198_00 });

    expect(k.invoices).toEqual({ count: 2, avg: Math.round((2_360_00 + 590_00) / 2) });
    // Collected 590 of 2,950 invoiced = 20%
    expect(k.collections.received).toBe(590_00);
    expect(k.collections.ratePct).toBeCloseTo(20, 5);

    // Receivable: A 2,360 − CN 1,180 = 1,180; B is paid.
    expect(k.receivables.total).toBe(1_180_00);
    expect(k.receivables.overdueCount).toBe(0);
    expect(k.receivables.avgAgeDays).toBe(0); // everything was raised today

    expect(k.purchases).toEqual({ taxable: 400_00, tax: 72_00 });
    expect(k.payables.total).toBe(472_00);

    expect(k.quotations).toMatchObject({ total: 2, won: 1, conversionPct: 50 });
    // Returns: 1,180 / 2,950 = 40%
    expect(k.returns.creditNotes).toBe(1_180_00);
    expect(k.returns.pct).toBeCloseTo(40, 5);

    // Active customers 2; B2B share of invoice taxable 2,000 / 2,500 = 80%
    expect(k.customers.active).toBe(2);
    expect(k.customers.b2bPct).toBeCloseTo(80, 5);
  });

  it("ranks top customers and products", async () => {
    const k = await dashboardKpis(ctx.companyId, from, to);
    expect(k.topCustomers.map((c) => [c.name, c.total, c.invoices])).toEqual([
      ["Registered Buyer", 2_360_00, 1],
      ["Walk-in", 590_00, 1],
    ]);
    expect(k.topProducts.map((p) => [p.name, p.taxable])).toEqual([
      ["Widget", 2_000_00],
      ["Gadget", 500_00],
    ]);
  });

  it("ages receivables and fills the monthly chart", async () => {
    const k = await dashboardKpis(ctx.companyId, from, to);
    expect(k.ageing.grand).toBe(1_180_00);
    expect(k.ageing.totals.reduce((a, b) => a + b, 0)).toBe(1_180_00);
    expect(k.monthly).toHaveLength(12);
    expect(k.monthly.reduce((a, m) => a + (m.sales ?? 0), 0)).toBeCloseTo(1_500, 5);
    expect(k.sales.thisMonth).toBe(1_500_00);
  });

  it("builds monthly chart series and sales breakdowns", async () => {
    const k = await dashboardKpis(ctx.companyId, from, to);
    const m = k.monthly[(Number(today.slice(5, 7)) + 8) % 12]; // this month's row (rupees)
    expect(m).toMatchObject({ sales: 1_500, purchases: 400, invoiced: 2_950, collected: 590, outputTax: 270, itc: 72, netGst: 198 });
    // Earlier months are zero; months after this one have no data yet (null), so charts don't plot fake zeros.
    const idx = (Number(today.slice(5, 7)) + 8) % 12;
    expect(k.monthly.slice(0, idx).every((r) => r.sales === 0 && r.collected === 0)).toBe(true);
    expect(k.monthly.slice(idx + 1).every((r) => r.sales === null && r.invoiced === null && r.netGst === null)).toBe(true);
    // All invoice lines are 18%; credit notes are not part of the invoice breakdown
    expect(k.salesByRate).toEqual([{ rate: 18, value: 2_500_00 }]);
    expect(k.salesByState).toEqual([{ code: "27", label: "Maharashtra", value: 2_500_00 }]);
  });
});
