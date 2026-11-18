import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { financialYear, todayIST } from "@/lib/gst/fy";
import { cancelPurchaseOrder, closePurchaseOrder, loadPurchaseOrder, reopenPurchaseOrder, savePurchaseOrder } from "@/lib/purchase-orders";
import { cancelPurchase, savePurchase } from "@/lib/purchases";
import type { CompanyContext } from "@/lib/tenant";
import { memberContext } from "./helpers";

/** Purchase orders and partial billing by purchase invoices, against the real database. */
describe("purchase orders", () => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const companies: string[] = [];
  const users: string[] = [];
  let ctx: CompanyContext;
  let supplier: { id: string };
  let otherSupplier: { id: string };
  const today = todayIST();
  let billSeq = 0;

  const makeCompany = async (tag: string) => {
    const u = await db.user.create({ data: { id: `po-${tag}-${stamp}`, name: "PO Tester", email: `po-${tag}-${stamp}@test.local` } });
    users.push(u.id);
    const c = await db.company.create({ data: { legalName: `PO ${tag} ${stamp}`, stateCode: "27", address: "Pune" } });
    companies.push(c.id);
    return memberContext(u, c);
  };
  const po = (partyId: string, items: Array<{ qty: number; rate?: number; description?: string; sourceId?: string }>) => ({
    partyId,
    date: today,
    placeOfSupply: "27",
    items: items.map((i, n) => ({ description: i.description ?? `Item ${n + 1}`, qty: i.qty, rate: i.rate ?? 100, gstRate: 18, ...(i.sourceId && { sourceId: i.sourceId }) })),
  });
  const bill = (orderId: string, lines: Array<{ sourceId: string; qty: number }>, partyId = supplier.id) =>
    savePurchase(ctx, null, {
      partyId,
      billNumber: `SUP-${stamp.slice(-6)}-${++billSeq}`,
      billDate: today,
      placeOfSupply: "27",
      purchaseOrderId: orderId,
      items: lines.map((l) => ({ description: "Billed", qty: l.qty, rate: 100, gstRate: 18, sourceId: l.sourceId })),
    });

  beforeAll(async () => {
    ctx = await makeCompany("a");
    supplier = await db.party.create({ data: { companyId: ctx.companyId, type: "SUPPLIER", name: "Steel Co", stateCode: "29", gstin: "" } });
    otherSupplier = await db.party.create({ data: { companyId: ctx.companyId, type: "SUPPLIER", name: "Other Co", stateCode: "27", gstin: "" } });
  });

  afterAll(async () => {
    for (const id of companies) {
      await db.paymentAllocation.deleteMany({ where: { purchaseBill: { companyId: id } } });
      await db.purchaseBill.deleteMany({ where: { companyId: id } });
      await db.purchaseOrder.deleteMany({ where: { companyId: id } });
    }
    await db.company.deleteMany({ where: { id: { in: companies } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });

  it("numbers orders PO/<fy>/0001, 0002… and computes inter-state tax", async () => {
    const id1 = await savePurchaseOrder(ctx, null, po(supplier.id, [{ qty: 2, rate: 500 }]));
    const id2 = await savePurchaseOrder(ctx, null, po(supplier.id, [{ qty: 1 }]));
    const a = (await loadPurchaseOrder(ctx.companyId, id1))!;
    const b = (await loadPurchaseOrder(ctx.companyId, id2))!;
    expect(a.number).toBe(`PO/${financialYear(today)}/0001`);
    expect(b.number).toBe(`PO/${financialYear(today)}/0002`);
    expect(a.isInterstate).toBe(true); // supplier in 29, delivered to 27
    expect(a).toMatchObject({ taxable: 100000, igst: 18000, grandTotal: 118000, status: "OPEN" });
  });

  it("partial invoices move the order Open → Partly billed → Billed, and a cancelled invoice reopens it", async () => {
    const id = await savePurchaseOrder(ctx, null, po(supplier.id, [{ qty: 10 }, { qty: 4 }]));
    const [l1, l2] = (await loadPurchaseOrder(ctx.companyId, id))!.items;

    const first = await bill(id, [{ sourceId: l1.id, qty: 6 }]);
    let o = (await loadPurchaseOrder(ctx.companyId, id))!;
    expect(o.status).toBe("PARTIAL");
    expect(o.items.map((i) => i.remaining)).toEqual([4, 4]);

    await bill(id, [
      { sourceId: l1.id, qty: 4 },
      { sourceId: l2.id, qty: 4 },
    ]);
    o = (await loadPurchaseOrder(ctx.companyId, id))!;
    expect(o.status).toBe("BILLED");
    expect(o.invoices).toHaveLength(2);

    await cancelPurchase(ctx, first);
    o = (await loadPurchaseOrder(ctx.companyId, id))!;
    expect(o.status).toBe("PARTIAL");
    expect(o.items[0]).toMatchObject({ billedQty: 4, remaining: 6 });
  });

  it("editing an invoice frees its own quantity before re-checking", async () => {
    const id = await savePurchaseOrder(ctx, null, po(supplier.id, [{ qty: 5 }]));
    const [l1] = (await loadPurchaseOrder(ctx.companyId, id))!.items;
    const billId = await bill(id, [{ sourceId: l1.id, qty: 5 }]);
    const b = await db.purchaseBill.findUniqueOrThrow({ where: { id: billId } });
    await savePurchase(ctx, billId, {
      partyId: supplier.id,
      billNumber: b.billNumber,
      billDate: today,
      placeOfSupply: "27",
      purchaseOrderId: id,
      items: [{ description: "Billed", qty: 3, rate: 100, gstRate: 18, sourceId: l1.id }],
    });
    const o = (await loadPurchaseOrder(ctx.companyId, id))!;
    expect(o.items[0]).toMatchObject({ billedQty: 3, remaining: 2 });
    expect(o.status).toBe("PARTIAL");
  });

  it("refuses over-billing, another supplier, foreign lines and closed orders", async () => {
    const id = await savePurchaseOrder(ctx, null, po(supplier.id, [{ qty: 3 }]));
    const [l1] = (await loadPurchaseOrder(ctx.companyId, id))!.items;
    await expect(bill(id, [{ sourceId: l1.id, qty: 4 }])).rejects.toThrow(/only 3 NOS left/);
    await expect(bill(id, [{ sourceId: l1.id, qty: 1 }], otherSupplier.id)).rejects.toThrow(/another supplier/);

    const other = await savePurchaseOrder(ctx, null, po(supplier.id, [{ qty: 1 }]));
    const [foreign] = (await loadPurchaseOrder(ctx.companyId, other))!.items;
    await expect(bill(id, [{ sourceId: foreign.id, qty: 1 }])).rejects.toThrow(/isn't on purchase order/);

    await bill(id, [{ sourceId: l1.id, qty: 1 }]);
    await closePurchaseOrder(ctx, id);
    await expect(bill(id, [{ sourceId: l1.id, qty: 1 }])).rejects.toThrow(/closed/);
    await reopenPurchaseOrder(ctx, id);
    expect((await loadPurchaseOrder(ctx.companyId, id))!.status).toBe("PARTIAL");
  });

  it("billed lines can't be cancelled, removed or reduced below what's billed", async () => {
    const id = await savePurchaseOrder(ctx, null, po(supplier.id, [{ qty: 5, description: "Bolts" }, { qty: 2, description: "Nuts" }]));
    const [bolts, nuts] = (await loadPurchaseOrder(ctx.companyId, id))!.items;
    await bill(id, [{ sourceId: bolts.id, qty: 3 }]);

    await expect(cancelPurchaseOrder(ctx, id)).rejects.toThrow(/Close it instead/);
    await expect(savePurchaseOrder(ctx, id, po(supplier.id, [{ qty: 2, description: "Bolts", sourceId: bolts.id }, { qty: 2, description: "Nuts", sourceId: nuts.id }]))).rejects.toThrow(
      /less than the 3 already billed/,
    );
    await expect(savePurchaseOrder(ctx, id, po(supplier.id, [{ qty: 2, description: "Nuts", sourceId: nuts.id }]))).rejects.toThrow(/can't be removed/);

    // Allowed: raise the billed line, drop the unbilled one, add a new one.
    await savePurchaseOrder(ctx, id, po(supplier.id, [{ qty: 8, description: "Bolts", sourceId: bolts.id }, { qty: 1, description: "Washers" }]));
    const o = (await loadPurchaseOrder(ctx.companyId, id))!;
    expect(o.items.map((i) => [i.description, i.qty, i.billedQty])).toEqual([
      ["Bolts", 8, 3],
      ["Washers", 1, 0],
    ]);
    expect(o.status).toBe("PARTIAL");
  });

  it("orders are private to their company", async () => {
    const id = await savePurchaseOrder(ctx, null, po(supplier.id, [{ qty: 1 }]));
    const other = await makeCompany("b");
    expect(await loadPurchaseOrder(other.companyId, id)).toBeNull();
    await expect(cancelPurchaseOrder(other, id)).rejects.toThrow(/not found/);
    await expect(savePurchaseOrder(other, null, po(supplier.id, [{ qty: 1 }]))).rejects.toThrow(/valid supplier/);
  });
});
