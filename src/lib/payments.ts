import "server-only";
import { z } from "zod";
import type { PaymentDirection } from "@/generated/prisma/enums";
import { UserError } from "./action";
import { db, runTx, type Tx } from "./db";
import { isoOf } from "./documents";
import { absoluteUrl, deliverSoon, enqueueEvent } from "./events/outbox";
import { assertNotLocked } from "./fy-context";
import { fromPaise, toPaise } from "./gst/calc";
import type { CompanyContext } from "./tenant";
import { isoDate, trimmed } from "./validation";

export const PAYMENT_MODES = ["CASH", "UPI", "BANK", "CHEQUE", "CARD", "OTHER"] as const;

export const paymentSchema = z.object({
  direction: z.enum(["RECEIVED", "PAID"]),
  partyId: z.string().min(1, "Select a party"),
  date: isoDate,
  amount: z.coerce.number().positive("Amount must be more than 0").max(1e11),
  mode: z.enum(PAYMENT_MODES),
  reference: trimmed(100).default(""),
  notes: trimmed(1000).default(""),
  allocations: z
    .array(z.object({ targetId: z.string().min(1), amount: z.coerce.number().min(0) }))
    .max(500)
    .default([]),
});
export type PaymentInput = z.input<typeof paymentSchema>;

export interface OpenItem {
  id: string;
  kind: "INVOICE" | "DEBIT_NOTE" | "PURCHASE";
  number: string;
  date: string;
  dueDate: string;
  total: number; // paise
  balance: number; // paise
}

const P = (v: { toNumber(): number } | null | undefined) => toPaise(v?.toNumber() ?? 0);

/** Receivable documents (invoices + debit notes) with outstanding balance, oldest first. */
export async function openReceivables(tx: Tx | typeof db, companyId: string, partyId?: string, ids?: string[]): Promise<OpenItem[]> {
  const docs = await tx.document.findMany({
    where: {
      companyId,
      type: { in: ["INVOICE", "DEBIT_NOTE"] },
      status: "ISSUED",
      ...(partyId && { partyId }),
      ...(ids && { id: { in: ids } }),
    },
    orderBy: [{ date: "asc" }, { seq: "asc" }],
    include: {
      allocations: { select: { amount: true } },
      notesOnThis: { where: { status: "ISSUED", type: "CREDIT_NOTE" }, select: { grandTotal: true } },
    },
  });
  return docs
    .map((d) => {
      const total = P(d.grandTotal);
      const settled = d.allocations.reduce((a, x) => a + P(x.amount), 0) + d.notesOnThis.reduce((a, x) => a + P(x.grandTotal), 0);
      return {
        id: d.id,
        kind: d.type as "INVOICE" | "DEBIT_NOTE",
        number: d.number,
        date: isoOf(d.date),
        dueDate: isoOf(d.dueDate),
        total,
        balance: total - settled,
      };
    })
    .filter((d) => d.balance > 0);
}

/** Purchase bills with outstanding balance, oldest first. */
export async function openPayables(tx: Tx | typeof db, companyId: string, partyId?: string, ids?: string[]): Promise<OpenItem[]> {
  const bills = await tx.purchaseBill.findMany({
    where: { companyId, cancelled: false, ...(partyId && { partyId }), ...(ids && { id: { in: ids } }) },
    orderBy: { billDate: "asc" },
    include: { allocations: { select: { amount: true } } },
  });
  return bills
    .map((b) => {
      const total = P(b.grandTotal);
      return {
        id: b.id,
        kind: "PURCHASE" as const,
        number: b.billNumber,
        date: isoOf(b.billDate),
        dueDate: isoOf(b.dueDate),
        total,
        balance: total - b.allocations.reduce((a, x) => a + P(x.amount), 0),
      };
    })
    .filter((b) => b.balance > 0);
}

export const openItems = (companyId: string, partyId: string, direction: PaymentDirection) =>
  direction === "RECEIVED" ? openReceivables(db, companyId, partyId) : openPayables(db, companyId, partyId);

export async function savePayment(ctx: CompanyContext, raw: PaymentInput) {
  const input = paymentSchema.parse(raw);
  const amount = toPaise(input.amount);
  const allocations = input.allocations.map((a) => ({ targetId: a.targetId, amount: toPaise(a.amount) })).filter((a) => a.amount > 0);
  const allocated = allocations.reduce((s, a) => s + a.amount, 0);
  if (allocated > amount) throw new UserError("Allocated amount exceeds the payment amount");
  if (new Set(allocations.map((a) => a.targetId)).size !== allocations.length) throw new UserError("Duplicate allocation");

  const paymentId = await runTx(async (tx) => {
    await assertNotLocked(tx, ctx.companyId, input.date);
    const party = await tx.party.findFirst({ where: { id: input.partyId, companyId: ctx.companyId } });
    if (!party) throw new UserError("Select a valid party", "partyId");

    const ids = allocations.map((a) => a.targetId);
    if (ids.length) {
      // Lock the target rows so concurrent payments can't over-allocate the same document.
      const table = input.direction === "RECEIVED" ? "document" : "purchase_bill";
      await tx.$queryRawUnsafe(`SELECT id FROM ${table} WHERE companyId = ? AND id IN (${ids.map(() => "?").join(",")}) FOR UPDATE`, ctx.companyId, ...ids);
    }
    const open =
      input.direction === "RECEIVED"
        ? await openReceivables(tx, ctx.companyId, party.id, ids)
        : await openPayables(tx, ctx.companyId, party.id, ids);
    const byId = new Map(open.map((o) => [o.id, o]));
    for (const a of allocations) {
      const target = byId.get(a.targetId);
      if (!target) throw new UserError("A selected document is no longer open for this party");
      if (a.amount > target.balance) throw new UserError(`Allocation to ${target.number} exceeds its balance`);
    }

    const payment = await tx.payment.create({
      data: {
        companyId: ctx.companyId,
        partyId: party.id,
        direction: input.direction,
        date: new Date(input.date + "T00:00:00Z"),
        amount: fromPaise(amount).toFixed(2),
        mode: input.mode,
        reference: input.reference,
        notes: input.notes,
        createdById: ctx.user.id,
        allocations: {
          create: allocations.map((a) => ({
            amount: fromPaise(a.amount).toFixed(2),
            ...(input.direction === "RECEIVED" ? { documentId: a.targetId } : { purchaseBillId: a.targetId }),
          })),
        },
      },
    });
    await tx.auditLog.create({
      data: { companyId: ctx.companyId, userId: ctx.user.id, action: "create", entity: "payment", entityId: payment.id, data: { amount: input.amount } },
    });
    if (input.direction === "RECEIVED") {
      // leadRef from the first allocated document that came from Lead Manager (optional).
      const linked = allocations.length
        ? await tx.document.findFirst({ where: { id: { in: allocations.map((a) => a.targetId) }, externalRef: { not: null } }, select: { externalRef: true } })
        : null;
      await enqueueEvent(tx, ctx.companyId, "payment.received", {
        id: payment.id,
        number: input.reference,
        total: fromPaise(amount),
        amount: fromPaise(amount),
        status: "RECEIVED",
        url: absoluteUrl(`/c/${ctx.companyId}/payments/${payment.id}`),
        leadRef: linked?.externalRef ?? undefined,
        partyId: party.id,
        invoiceIds: allocations.map((a) => a.targetId),
        date: input.date,
      });
    }
    return payment.id;
  });
  await deliverSoon(ctx.companyId);
  return paymentId;
}

export async function deletePayment(ctx: CompanyContext, id: string) {
  await runTx(async (tx) => {
    const p = await tx.payment.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!p) throw new UserError("Payment not found");
    await assertNotLocked(tx, ctx.companyId, p.date);
    await tx.payment.delete({ where: { id } }); // allocations cascade
    await tx.auditLog.create({
      data: { companyId: ctx.companyId, userId: ctx.user.id, action: "delete", entity: "payment", entityId: id, data: { amount: p.amount.toString() } },
    });
  });
}
