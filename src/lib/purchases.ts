import "server-only";
import { z } from "zod";
import { UserError } from "./action";
import { db, runTx, type Tx } from "./db";
import { isoOf, lineSchema } from "./documents";
import { eventItems } from "./events/items";
import { absoluteUrl, deliverSoon, emitEvent } from "./events/outbox";
import { calcDocument, fromPaise, toPaise } from "./gst/calc";
import { assertNotLocked } from "./fy-context";
import { isStateCode } from "./gst/states";
import { remainingQty } from "./po-status";
import { recomputePoBilling } from "./purchase-orders";
import type { CompanyContext } from "./tenant";
import { isoDate, trimmed } from "./validation";

export const purchaseSchema = z.object({
  partyId: z.string().min(1, "Select a supplier"),
  billNumber: trimmed(30).min(1, "Supplier invoice number is required"),
  billDate: isoDate,
  dueDate: z.union([isoDate, z.literal("")]).default(""),
  placeOfSupply: z.string().refine(isStateCode, "Select place of supply"),
  reverseCharge: z.coerce.boolean().default(false),
  itcType: z.enum(["ELIGIBLE", "INELIGIBLE", "CAPITAL_GOODS"]).default("ELIGIBLE"),
  pricesIncludeTax: z.coerce.boolean().default(false),
  notes: trimmed(2000).default(""),
  /** The purchase order this invoice bills (lines carry the PO line in sourceId). */
  purchaseOrderId: z.string().max(40).optional().default(""),
  items: z.array(lineSchema.extend({ sourceId: z.string().max(40).optional() })).min(1, "Add at least one item").max(200),
});
export type PurchaseInput = z.input<typeof purchaseSchema>;

const rupees = (p: number) => fromPaise(p).toFixed(2);

/**
 * Validates an invoice's link to a purchase order: same company and supplier, order not cancelled or
 * closed, and no line billed beyond what's left on it (this invoice's own earlier qty counts as free).
 * Returns the order id and, per submitted line, the PO line it bills.
 */
async function checkPoLinks(tx: Tx, companyId: string, billId: string | null, partyId: string, input: z.output<typeof purchaseSchema>) {
  const previousOrderId = billId ? ((await tx.purchaseBill.findUnique({ where: { id: billId }, select: { purchaseOrderId: true } }))?.purchaseOrderId ?? null) : null;
  const lineIds = input.items.map((l) => l.sourceId || null);
  const orderId = input.purchaseOrderId || null;
  if (!orderId) {
    if (lineIds.some(Boolean)) throw new UserError("Lines from a purchase order need the order");
    return { orderId: null, previousOrderId, lineIds };
  }
  const po = await tx.purchaseOrder.findFirst({ where: { id: orderId, companyId }, include: { items: true } });
  if (!po) throw new UserError("Purchase order not found");
  if (po.partyId !== partyId) throw new UserError(`Purchase order ${po.number} is for another supplier`, "partyId");
  if ((po.status === "CANCELLED" || po.status === "CLOSED") && previousOrderId !== orderId) throw new UserError(`Purchase order ${po.number} is ${po.status.toLowerCase()}`);
  const byId = new Map(po.items.map((i) => [i.id, i]));
  // Qty this invoice already had on each PO line (editing): it's freed before re-checking.
  const own = billId ? await tx.purchaseItem.groupBy({ by: ["poItemId"], where: { billId, poItemId: { not: null } }, _sum: { qty: true } }) : [];
  const ownQty = new Map(own.map((o) => [o.poItemId, o._sum.qty?.toNumber() ?? 0]));
  const asked = new Map<string, number>();
  input.items.forEach((l, i) => {
    const sid = lineIds[i];
    if (!sid) return;
    if (!byId.has(sid)) throw new UserError(`Line "${l.description}" isn't on purchase order ${po.number}`);
    asked.set(sid, (asked.get(sid) ?? 0) + l.qty);
  });
  for (const [sid, qty] of asked) {
    const line = byId.get(sid)!;
    const left = remainingQty(line.qty.toNumber(), line.billedQty.toNumber() - (ownQty.get(sid) ?? 0));
    if (Math.round(qty * 1000) > Math.round(left * 1000)) throw new UserError(`"${line.description}": only ${left} ${line.unit} left to bill on ${po.number}`);
  }
  return { orderId, previousOrderId, lineIds };
}

export async function savePurchase(ctx: CompanyContext, id: string | null, raw: PurchaseInput) {
  const input = purchaseSchema.parse(raw);
  const savedId = await runTx(async (tx) => {
    await assertNotLocked(tx, ctx.companyId, input.billDate);
    const party = await tx.party.findFirst({ where: { id: input.partyId, companyId: ctx.companyId } });
    if (!party) throw new UserError("Select a valid supplier", "partyId");

    // Inter-state when the supplier's state differs from the place of supply.
    const isInterstate = party.stateCode !== input.placeOfSupply;
    const { lines, totals } = calcDocument(input.items, { interstate: isInterstate, pricesIncludeTax: input.pricesIncludeTax });
    if (totals.grandTotal <= 0) throw new UserError("Invoice total must be more than zero");
    const poLinks = await checkPoLinks(tx, ctx.companyId, id, party.id, input);

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
      purchaseOrderId: poLinks.orderId,
    };

    let billId: string;
    if (id) {
      const existing = await tx.purchaseBill.findFirst({ where: { id, companyId: ctx.companyId } });
      if (!existing || existing.cancelled) throw new UserError("Purchase invoice not found or cancelled");
      await assertNotLocked(tx, ctx.companyId, existing.billDate);
      const paid = await tx.paymentAllocation.aggregate({ where: { purchaseBillId: id }, _sum: { amount: true } });
      if (toPaise(paid._sum.amount?.toNumber() ?? 0) > totals.grandTotal) throw new UserError("Invoice total can't be less than payments already made");
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
        poItemId: poLinks.lineIds[position] ?? null,
      })),
    });
    // Keep the linked order's billed quantities and status current (old and new order on a change).
    for (const orderId of new Set([poLinks.orderId, poLinks.previousOrderId].filter((x): x is string => !!x))) await recomputePoBilling(tx, orderId);
    await tx.auditLog.create({
      data: { companyId: ctx.companyId, userId: ctx.user.id, action: id ? "update" : "create", entity: "purchase", entityId: billId },
    });
    await emitEvent(tx, ctx.companyId, "purchase.saved", {
      id: billId,
      number: input.billNumber,
      total: totals.grandTotal / 100,
      amount: totals.grandTotal / 100,
      status: id ? "UPDATED" : "CREATED",
      url: absoluteUrl(`/c/${ctx.companyId}/purchases/${billId}`),
      partyId: party.id,
      partyName: party.name,
      date: input.billDate,
      itcType: input.itcType,
      purchaseOrderId: poLinks.orderId ?? null,
      items: eventItems(lines),
    });
    return billId;
  });
  await deliverSoon(ctx.companyId);
  return savedId;
}

export async function cancelPurchase(ctx: CompanyContext, id: string) {
  await runTx(async (tx) => {
    const bill = await tx.purchaseBill.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!bill) throw new UserError("Purchase invoice not found");
    await assertNotLocked(tx, ctx.companyId, bill.billDate);
    if (await tx.paymentAllocation.count({ where: { purchaseBillId: id } })) throw new UserError("Remove payments recorded against this invoice first");
    await tx.purchaseBill.update({ where: { id }, data: { cancelled: true } });
    if (bill.purchaseOrderId) await recomputePoBilling(tx, bill.purchaseOrderId);
    await tx.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "cancel", entity: "purchase", entityId: id } });
    const items = await tx.purchaseItem.findMany({ where: { billId: id }, orderBy: { position: "asc" } });
    await emitEvent(tx, ctx.companyId, "purchase.cancelled", {
      id,
      number: bill.billNumber,
      total: bill.grandTotal.toNumber(),
      amount: bill.grandTotal.toNumber(),
      status: "CANCELLED",
      url: absoluteUrl(`/c/${ctx.companyId}/purchases/${id}`),
      partyId: bill.partyId,
      partyName: bill.partyName,
      date: bill.billDate.toISOString().slice(0, 10),
      purchaseOrderId: bill.purchaseOrderId,
      items: items.map((i) => ({
        productId: i.productId,
        description: i.description,
        hsnSac: i.hsnSac,
        qty: i.qty.toNumber(),
        unit: i.unit,
        rate: i.rate.toNumber(),
        gstRate: i.gstRate.toNumber(),
        taxable: i.taxable.toNumber(),
      })),
    });
  });
  await deliverSoon(ctx.companyId);
}

export async function loadPurchase(companyId: string, id: string) {
  const b = await db.purchaseBill.findFirst({
    where: { id, companyId },
    include: {
      items: { orderBy: { position: "asc" } },
      allocations: { include: { payment: { select: { id: true, date: true, mode: true } } } },
      purchaseOrder: { select: { id: true, number: true } },
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
    purchaseOrder: b.purchaseOrder,
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
      sourceId: i.poItemId ?? undefined,
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
