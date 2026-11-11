import "server-only";
import { z } from "zod";
import { UserError } from "./action";
import { db, runTx } from "./db";
import { isoOf, lineSchema } from "./documents";
import { calcDocument, fromPaise, toPaise } from "./gst/calc";
import { assertNotLocked } from "./fy-context";
import { isStateCode } from "./gst/states";
import type { CompanyContext } from "./tenant";
import { isoDate, trimmed } from "./validation";

export const purchaseSchema = z.object({
  partyId: z.string().min(1, "Select a supplier"),
  billNumber: trimmed(30).min(1, "Supplier bill number is required"),
  billDate: isoDate,
  dueDate: z.union([isoDate, z.literal("")]).default(""),
  placeOfSupply: z.string().refine(isStateCode, "Select place of supply"),
  reverseCharge: z.coerce.boolean().default(false),
  itcType: z.enum(["ELIGIBLE", "INELIGIBLE", "CAPITAL_GOODS"]).default("ELIGIBLE"),
  pricesIncludeTax: z.coerce.boolean().default(false),
  notes: trimmed(2000).default(""),
  items: z.array(lineSchema).min(1, "Add at least one item").max(200),
});
export type PurchaseInput = z.input<typeof purchaseSchema>;

const rupees = (p: number) => fromPaise(p).toFixed(2);

export async function savePurchase(ctx: CompanyContext, id: string | null, raw: PurchaseInput) {
  const input = purchaseSchema.parse(raw);
  return runTx(async (tx) => {
    await assertNotLocked(tx, ctx.companyId, input.billDate);
    const party = await tx.party.findFirst({ where: { id: input.partyId, companyId: ctx.companyId } });
    if (!party) throw new UserError("Select a valid supplier", "partyId");

    // Inter-state when the supplier's state differs from the place of supply.
    const isInterstate = party.stateCode !== input.placeOfSupply;
    const { lines, totals } = calcDocument(input.items, { interstate: isInterstate, pricesIncludeTax: input.pricesIncludeTax });
    if (totals.grandTotal <= 0) throw new UserError("Bill total must be more than zero");

    const header = {
      billNumber: input.billNumber,
      billDate: new Date(input.billDate + "T00:00:00Z"),
      dueDate: input.dueDate ? new Date(input.dueDate + "T00:00:00Z") : null,
      partyId: party.id,
      partyName: party.name,
      partyGstin: party.gstin,
      partyState: party.stateCode,
      placeOfSupply: input.placeOfSupply,
      isInterstate,
      reverseCharge: input.reverseCharge,
      itcType: input.itcType,
      pricesIncludeTax: input.pricesIncludeTax,
      taxableTotal: rupees(totals.taxable),
      cgst: rupees(totals.cgst),
      sgst: rupees(totals.sgst),
      igst: rupees(totals.igst),
      roundOff: rupees(totals.roundOff),
      grandTotal: rupees(totals.grandTotal),
      notes: input.notes,
    };

    let billId: string;
    if (id) {
      const existing = await tx.purchaseBill.findFirst({ where: { id, companyId: ctx.companyId } });
      if (!existing || existing.cancelled) throw new UserError("Bill not found or cancelled");
      await assertNotLocked(tx, ctx.companyId, existing.billDate);
      const paid = await tx.paymentAllocation.aggregate({ where: { purchaseBillId: id }, _sum: { amount: true } });
      if (toPaise(paid._sum.amount?.toNumber() ?? 0) > totals.grandTotal) throw new UserError("Bill total can't be less than payments already made");
      if (paid._sum.amount && existing.partyId !== party.id) throw new UserError("Supplier can't be changed after payments are recorded");
      await tx.purchaseBill.update({ where: { id }, data: header });
      await tx.purchaseItem.deleteMany({ where: { billId: id } });
      billId = id;
    } else {
      billId = (await tx.purchaseBill.create({ data: { ...header, companyId: ctx.companyId, createdById: ctx.user.id } })).id;
    }

    await tx.purchaseItem.createMany({
      data: lines.map((l, position) => ({
        billId,
        position,
        productId: l.productId || null,
        description: l.description,
        hsnSac: l.hsnSac,
        unit: l.unit.toUpperCase(),
        qty: l.qty,
        rate: l.rate,
        discountPct: l.discountPct,
        gstRate: l.gstRate,
        taxable: rupees(l.taxable),
        cgst: rupees(l.cgst),
        sgst: rupees(l.sgst),
        igst: rupees(l.igst),
        total: rupees(l.total),
      })),
    });
    await tx.auditLog.create({
      data: { companyId: ctx.companyId, userId: ctx.user.id, action: id ? "update" : "create", entity: "purchase", entityId: billId },
    });
    return billId;
  });
}

export async function cancelPurchase(ctx: CompanyContext, id: string) {
  await runTx(async (tx) => {
    const bill = await tx.purchaseBill.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!bill) throw new UserError("Bill not found");
    await assertNotLocked(tx, ctx.companyId, bill.billDate);
    if (await tx.paymentAllocation.count({ where: { purchaseBillId: id } })) throw new UserError("Remove payments recorded against this bill first");
    await tx.purchaseBill.update({ where: { id }, data: { cancelled: true } });
    await tx.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "cancel", entity: "purchase", entityId: id } });
  });
}

export async function loadPurchase(companyId: string, id: string) {
  const b = await db.purchaseBill.findFirst({
    where: { id, companyId },
    include: {
      items: { orderBy: { position: "asc" } },
      allocations: { include: { payment: { select: { id: true, date: true, mode: true } } } },
    },
  });
  if (!b) return null;
  const p = (v: { toNumber(): number }) => toPaise(v.toNumber());
  const grandTotal = p(b.grandTotal);
  const paid = b.allocations.reduce((s, a) => s + p(a.amount), 0);
  return {
    id: b.id,
    billNumber: b.billNumber,
    billDate: isoOf(b.billDate),
    dueDate: isoOf(b.dueDate),
    partyId: b.partyId,
    partyName: b.partyName,
    partyGstin: b.partyGstin,
    partyState: b.partyState,
    placeOfSupply: b.placeOfSupply,
    isInterstate: b.isInterstate,
    reverseCharge: b.reverseCharge,
    itcType: b.itcType,
    pricesIncludeTax: b.pricesIncludeTax,
    cancelled: b.cancelled,
    notes: b.notes ?? "",
    taxable: p(b.taxableTotal),
    cgst: p(b.cgst),
    sgst: p(b.sgst),
    igst: p(b.igst),
    roundOff: p(b.roundOff),
    grandTotal,
    paid,
    balance: grandTotal - paid,
    payments: b.allocations.map((a) => ({ id: a.payment.id, date: isoOf(a.payment.date), mode: a.payment.mode, amount: p(a.amount) })),
    items: b.items.map((i) => ({
      productId: i.productId,
      description: i.description,
      hsnSac: i.hsnSac,
      unit: i.unit,
      qty: i.qty.toNumber(),
      rate: i.rate.toNumber(),
      discountPct: i.discountPct.toNumber(),
      gstRate: i.gstRate.toNumber(),
      taxable: p(i.taxable),
      cgst: p(i.cgst),
      sgst: p(i.sgst),
      igst: p(i.igst),
      total: p(i.total),
    })),
  };
}
