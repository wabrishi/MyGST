import "server-only";
import { z } from "zod";
import { UserError } from "./action";
import { db, runTx, type Tx } from "./db";
import { isoOf, lineSchema } from "./documents";
import { eventItems } from "./events/items";
import { absoluteUrl, deliverSoon, emitEvent } from "./events/outbox";
import { calcDocument, fromPaise, toPaise } from "./gst/calc";
import { isStateCode, stateName } from "./gst/states";
import { allocateNumber } from "./numbering";
import { derivePoStatus, remainingQty, type PoStatus } from "./po-status";
import type { CompanyContext } from "./tenant";
import { isoDate, trimmed } from "./validation";

/**
 * Purchase orders: what we order from a supplier. They have their own number series (PO/26-27/0001),
 * a PDF and email, and are billed by one or more purchase invoices (partial billing). A PO is not a book
 * entry: no ITC, no payables, no financial-year lock.
 */

const poLine = lineSchema.extend({ sourceId: z.string().max(40).optional() });

export const poSchema = z.object({
  partyId: z.string().min(1, "Select a supplier"),
  date: isoDate,
  expectedDate: z.union([isoDate, z.literal("")]).default(""),
  placeOfSupply: z.string().refine(isStateCode, "Select place of supply"),
  pricesIncludeTax: z.coerce.boolean().default(false),
  deliveryAddress: trimmed(1000).default(""),
  paymentTerms: trimmed(200).default(""),
  notes: trimmed(2000).default(""),
  items: z.array(poLine).min(1, "Add at least one item").max(200),
});
export type PurchaseOrderInput = z.input<typeof poSchema>;

const rupees = (p: number) => fromPaise(p).toFixed(2);
const num = (v: { toNumber(): number }) => v.toNumber();

/** Company address as a single delivery line (the default "Deliver to"). */
export function companyDeliveryAddress(c: { legalName: string; tradeName: string; address: string; city: string; pincode: string; stateCode: string }) {
  return [c.tradeName || c.legalName, c.address, [c.city, c.pincode].filter(Boolean).join(" "), c.stateCode ? stateName(c.stateCode) : ""].filter(Boolean).join(", ");
}

export const defaultPaymentTerms = (creditDays: number) => (creditDays > 0 ? `Net ${creditDays} days` : "");

export async function savePurchaseOrder(ctx: CompanyContext, id: string | null, raw: PurchaseOrderInput) {
  const savedId = await writePurchaseOrder(ctx, id, raw);
  await deliverSoon(ctx.companyId);
  return savedId;
}

async function writePurchaseOrder(ctx: CompanyContext, id: string | null, raw: PurchaseOrderInput) {
  const input = poSchema.parse(raw);
  return runTx(async (tx) => {
    const party = await tx.party.findFirst({ where: { id: input.partyId, companyId: ctx.companyId } });
    if (!party) throw new UserError("Select a valid supplier", "partyId");
    if (input.expectedDate && input.expectedDate < input.date) throw new UserError("Expected delivery can't be before the order date", "expectedDate");

    const isInterstate = party.stateCode !== input.placeOfSupply;
    const { lines, totals } = calcDocument(input.items, { interstate: isInterstate, pricesIncludeTax: input.pricesIncludeTax });
    if (totals.grandTotal <= 0) throw new UserError("Order total must be more than zero");

    const header = {
      date: new Date(input.date + "T00:00:00Z"),
      expectedDate: input.expectedDate ? new Date(input.expectedDate + "T00:00:00Z") : null,
      partyId: party.id,
      partyName: party.name,
      partyGstin: party.gstin,
      partyAddress: party.billingAddress ?? "",
      partyState: party.stateCode,
      placeOfSupply: input.placeOfSupply,
      isInterstate,
      pricesIncludeTax: input.pricesIncludeTax,
      deliveryAddress: input.deliveryAddress,
      paymentTerms: input.paymentTerms,
      notes: input.notes,
      taxableTotal: rupees(totals.taxable),
      cgst: rupees(totals.cgst),
      sgst: rupees(totals.sgst),
      igst: rupees(totals.igst),
      roundOff: rupees(totals.roundOff),
      grandTotal: rupees(totals.grandTotal),
    };
    const lineData = (l: (typeof lines)[number], position: number) => ({
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
    });

    if (!id) {
      const { fy, seq, number } = await allocateNumber(tx, ctx.companyId, "PURCHASE_ORDER", input.date);
      const po = await tx.purchaseOrder.create({
        data: { ...header, companyId: ctx.companyId, number, fy, seq, createdById: ctx.user.id, items: { create: lines.map(lineData) } },
      });
      await tx.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "create", entity: "purchase_order", entityId: po.id, data: { number } } });
      await emitPoSaved(tx, ctx.companyId, po.id, number, "CREATED", party, input, totals.grandTotal, lines);
      return po.id;
    }

    const existing = await tx.purchaseOrder.findFirst({ where: { id, companyId: ctx.companyId }, include: { items: true } });
    if (!existing) throw new UserError("Purchase order not found");
    if (existing.status !== "OPEN" && existing.status !== "PARTIAL") throw new UserError("Only open or partly billed orders can be edited");
    const billed = existing.items.filter((i) => num(i.billedQty) > 0);
    if (billed.length && existing.partyId !== party.id) throw new UserError("The supplier can't change once the order has been billed", "partyId");

    // Lines keep their identity (sourceId) so billed lines stay linked to their invoices.
    const byId = new Map(existing.items.map((i) => [i.id, i]));
    const kept = new Set<string>();
    for (const [position, l] of lines.entries()) {
      const prev = l.sourceId ? byId.get(l.sourceId) : undefined;
      if (prev) {
        if (l.qty < num(prev.billedQty)) throw new UserError(`"${l.description}": quantity can't be less than the ${num(prev.billedQty)} already billed`);
        kept.add(prev.id);
        await tx.purchaseOrderItem.update({ where: { id: prev.id }, data: lineData(l, position) });
      } else {
        await tx.purchaseOrderItem.create({ data: { ...lineData(l, position), orderId: id } });
      }
    }
    for (const i of existing.items) {
      if (kept.has(i.id)) continue;
      if (num(i.billedQty) > 0) throw new UserError(`"${i.description}" has been billed and can't be removed`);
      await tx.purchaseOrderItem.delete({ where: { id: i.id } });
    }
    await tx.purchaseOrder.update({ where: { id }, data: header });
    await recomputePoBilling(tx, id);
    await tx.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "update", entity: "purchase_order", entityId: id } });
    await emitPoSaved(tx, ctx.companyId, id, existing.number, "UPDATED", party, input, totals.grandTotal, lines);
    return id;
  });
}

async function emitPoSaved(
  tx: Tx,
  companyId: string,
  id: string,
  number: string,
  status: "CREATED" | "UPDATED",
  party: { id: string; name: string },
  input: { date: string; expectedDate?: string | null },
  grandTotalPaise: number,
  lines: Parameters<typeof eventItems>[0],
) {
  await emitEvent(tx, companyId, "purchase_order.saved", {
    id,
    number,
    total: grandTotalPaise / 100,
    amount: grandTotalPaise / 100,
    status,
    url: absoluteUrl(`/c/${companyId}/purchase-orders/${id}`),
    partyId: party.id,
    partyName: party.name,
    date: input.date,
    expectedDate: input.expectedDate || null,
    items: eventItems(lines),
  });
}

/**
 * Re-derives each line's billed quantity from purchase invoices that aren't cancelled, then the status.
 * Call inside the transaction that changed an invoice linked to this order.
 */
export async function recomputePoBilling(tx: Tx, orderId: string) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: orderId }, select: { status: true, items: { select: { id: true, qty: true } } } });
  if (!po) return;
  const sums = await tx.purchaseItem.groupBy({
    by: ["poItemId"],
    where: { poItemId: { in: po.items.map((i) => i.id) }, bill: { cancelled: false } },
    _sum: { qty: true },
  });
  const billedOf = new Map(sums.map((s) => [s.poItemId, s._sum.qty?.toNumber() ?? 0]));
  const lines = po.items.map((i) => ({ id: i.id, qty: num(i.qty), billedQty: billedOf.get(i.id) ?? 0 }));
  for (const l of lines) await tx.purchaseOrderItem.update({ where: { id: l.id }, data: { billedQty: l.billedQty } });
  const status = derivePoStatus(po.status, lines);
  if (status !== po.status) await tx.purchaseOrder.update({ where: { id: orderId }, data: { status } });
  return status;
}

async function setStatus(ctx: CompanyContext, id: string, action: "cancel" | "close" | "reopen") {
  await runTx(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({ where: { id, companyId: ctx.companyId }, include: { items: { select: { qty: true, billedQty: true } } } });
    if (!po) throw new UserError("Purchase order not found");
    const anyBilled = po.items.some((i) => num(i.billedQty) > 0);
    if (action === "cancel") {
      if (po.status === "CANCELLED") return;
      if (anyBilled) throw new UserError("This order has been billed. Close it instead to stop expecting the rest.");
      await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      await emitEvent(tx, ctx.companyId, "purchase_order.cancelled", {
        id,
        number: po.number,
        total: po.grandTotal.toNumber(),
        amount: po.grandTotal.toNumber(),
        status: "CANCELLED",
        url: absoluteUrl(`/c/${ctx.companyId}/purchase-orders/${id}`),
        partyId: po.partyId,
        partyName: po.partyName,
      });
    } else if (action === "close") {
      if (po.status !== "OPEN" && po.status !== "PARTIAL") throw new UserError("Only open or partly billed orders can be closed");
      await tx.purchaseOrder.update({ where: { id }, data: { status: "CLOSED" } });
    } else {
      if (po.status !== "CLOSED") throw new UserError("Only closed orders can be reopened");
      const lines = po.items.map((i) => ({ qty: num(i.qty), billedQty: num(i.billedQty) }));
      await tx.purchaseOrder.update({ where: { id }, data: { status: derivePoStatus("OPEN", lines) } });
    }
    await tx.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action, entity: "purchase_order", entityId: id } });
  });
}

export const cancelPurchaseOrder = async (ctx: CompanyContext, id: string) => {
  await setStatus(ctx, id, "cancel");
  await deliverSoon(ctx.companyId);
};
export const closePurchaseOrder = (ctx: CompanyContext, id: string) => setStatus(ctx, id, "close");
export const reopenPurchaseOrder = (ctx: CompanyContext, id: string) => setStatus(ctx, id, "reopen");

export async function loadPurchaseOrder(companyId: string, id: string) {
  const po = await db.purchaseOrder.findFirst({
    where: { id, companyId },
    include: {
      items: { orderBy: { position: "asc" } },
      invoices: { orderBy: { billDate: "asc" }, select: { id: true, billNumber: true, billDate: true, grandTotal: true, cancelled: true } },
      party: { select: { email: true, phone: true } },
    },
  });
  if (!po) return null;
  const p = (v: { toNumber(): number }) => toPaise(v.toNumber());
  return {
    id: po.id,
    number: po.number,
    date: isoOf(po.date),
    expectedDate: isoOf(po.expectedDate),
    status: po.status as PoStatus,
    partyId: po.partyId,
    partyName: po.partyName,
    partyGstin: po.partyGstin,
    partyAddress: po.partyAddress,
    partyState: po.partyState,
    partyEmail: po.party.email ?? "",
    partyPhone: po.party.phone ?? "",
    placeOfSupply: po.placeOfSupply,
    isInterstate: po.isInterstate,
    pricesIncludeTax: po.pricesIncludeTax,
    deliveryAddress: po.deliveryAddress,
    paymentTerms: po.paymentTerms,
    notes: po.notes ?? "",
    taxable: p(po.taxableTotal),
    cgst: p(po.cgst),
    sgst: p(po.sgst),
    igst: p(po.igst),
    roundOff: p(po.roundOff),
    grandTotal: p(po.grandTotal),
    invoices: po.invoices.map((b) => ({ id: b.id, number: b.billNumber, date: isoOf(b.billDate), total: p(b.grandTotal), cancelled: b.cancelled })),
    items: po.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      description: i.description,
      hsnSac: i.hsnSac,
      unit: i.unit,
      qty: num(i.qty),
      billedQty: num(i.billedQty),
      remaining: remainingQty(num(i.qty), num(i.billedQty)),
      rate: num(i.rate),
      discountPct: num(i.discountPct),
      gstRate: num(i.gstRate),
      taxable: p(i.taxable),
      cgst: p(i.cgst),
      sgst: p(i.sgst),
      igst: p(i.igst),
      total: p(i.total),
    })),
  };
}

export type LoadedPurchaseOrder = NonNullable<Awaited<ReturnType<typeof loadPurchaseOrder>>>;

/** Open (incl. partly billed) orders: count, value and how many are past their delivery date. */
export async function openPurchaseOrderStats(companyId: string, today: string) {
  const open = { companyId, status: { in: ["OPEN", "PARTIAL"] as PoStatus[] } };
  const [agg, overdue] = await Promise.all([
    db.purchaseOrder.aggregate({ where: open, _count: true, _sum: { grandTotal: true } }),
    db.purchaseOrder.count({ where: { ...open, expectedDate: { lt: new Date(today + "T00:00:00Z") } } }),
  ]);
  return { count: agg._count, value: toPaise(agg._sum.grandTotal?.toNumber() ?? 0), overdue };
}
