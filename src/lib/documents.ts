import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { DocType } from "@/generated/prisma/enums";
import { UserError } from "./action";
import { db, runTx, type Tx } from "./db";
import { NOTE_REASONS, isNote } from "./doc-kinds";
import { calcDocument, fromPaise, toPaise } from "./gst/calc";
import { financialYear, todayIST } from "./gst/fy";
import { isStateCode } from "./gst/states";
import { assertNotLocked } from "./fy-context";
import { allocateNumber } from "./numbering";
import { can } from "./permissions";
import type { CompanyContext } from "./tenant";
import { gstRate, isoDate, trimmed } from "./validation";

// ───────────────────────── Input schema ─────────────────────────

export const lineSchema = z.object({
  productId: z.string().nullish(),
  description: trimmed(300).min(1, "Item description is required"),
  hsnSac: z
    .string()
    .trim()
    .refine((s) => s === "" || /^[0-9]{4,8}$/.test(s), "HSN/SAC must be 4–8 digits")
    .default(""),
  unit: trimmed(10).default("NOS"),
  qty: z.coerce.number().positive("Qty must be more than 0").max(1e9),
  rate: z.coerce.number().min(0, "Rate can't be negative").max(1e10),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  gstRate,
});

export const docInputSchema = z.object({
  partyId: z.string().min(1, "Select a party"),
  date: isoDate,
  dueDate: z.union([isoDate, z.literal("")]).default(""),
  placeOfSupply: z.string().refine(isStateCode, "Select place of supply"),
  reverseCharge: z.coerce.boolean().default(false),
  pricesIncludeTax: z.coerce.boolean().default(false),
  shippingAddress: trimmed(500).default(""),
  notes: trimmed(2000).default(""),
  originalDocId: z.string().default(""),
  noteReason: z.string().default(""),
  sourceQuotationId: z.string().default(""),
  items: z.array(lineSchema).min(1, "Add at least one item").max(200),
});

export type DocInput = z.input<typeof docInputSchema>;

// ───────────────────────── Helpers ─────────────────────────

const rupees = (paise: number) => fromPaise(paise).toFixed(2);
const toDate = (iso: string) => new Date(iso + "T00:00:00Z");
export const isoOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

function sellerSnapshot(c: Prisma.CompanyGetPayload<object>) {
  return {
    legalName: c.legalName,
    tradeName: c.tradeName,
    gstin: c.gstin,
    address: c.address,
    city: c.city,
    pincode: c.pincode,
    stateCode: c.stateCode,
    phone: c.phone,
    email: c.email,
    bankName: c.bankName,
    bankAccount: c.bankAccount,
    bankIfsc: c.bankIfsc,
    bankBranch: c.bankBranch,
    upiId: c.upiId,
    terms: c.terms ?? "",
  };
}
export type SellerSnapshot = ReturnType<typeof sellerSnapshot>;

/** Whether this user may edit the given document. */
export function canEditDoc(ctx: CompanyContext, doc: { createdById: string; createdAt: Date; status: string; type: DocType }) {
  if (doc.status === "CANCELLED" || doc.status === "CONVERTED") return false;
  if (can(ctx.role, "docs.editAny")) return true;
  // Staff: only their own documents, and only on the day they were created (IST).
  return doc.createdById === ctx.user.id && todayIST(doc.createdAt) === todayIST();
}

/** Sum of grand totals of issued credit notes against an invoice, in paise. */
async function creditedPaise(tx: Tx, invoiceId: string, excludeId?: string) {
  const agg = await tx.document.aggregate({
    where: { originalDocId: invoiceId, type: "CREDIT_NOTE", status: "ISSUED", ...(excludeId && { id: { not: excludeId } }) },
    _sum: { grandTotal: true },
  });
  return toPaise(agg._sum.grandTotal?.toNumber() ?? 0);
}

// ───────────────────────── Save ─────────────────────────

export async function saveDocument(ctx: CompanyContext, type: DocType, id: string | null, raw: DocInput) {
  const input = docInputSchema.parse(raw);
  const companyId = ctx.companyId;

  return runTx(async (tx) => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    if (type !== "QUOTATION") await assertNotLocked(tx, companyId, input.date);
    const party = await tx.party.findFirst({ where: { id: input.partyId, companyId } });
    if (!party) throw new UserError("Select a valid party", "partyId");

    let placeOfSupply = input.placeOfSupply;
    let original: Prisma.DocumentGetPayload<object> | null = null;

    if (isNote(type)) {
      if (!input.originalDocId) throw new UserError("Select the original invoice", "originalDocId");
      original = await tx.document.findFirst({
        where: { id: input.originalDocId, companyId, type: "INVOICE", status: "ISSUED", partyId: party.id },
      });
      if (!original) throw new UserError("Original invoice not found for this party", "originalDocId");
      if (!(NOTE_REASONS as readonly string[]).includes(input.noteReason)) throw new UserError("Select a reason", "noteReason");
      if (input.date < isoOf(original.date)) throw new UserError("Note date can't be before the invoice date", "date");
      placeOfSupply = original.placeOfSupply; // a note follows the tax treatment of its invoice
    }

    const isInterstate = placeOfSupply !== company.stateCode;
    const { lines, totals } = calcDocument(input.items, { interstate: isInterstate, pricesIncludeTax: input.pricesIncludeTax });
    if (totals.grandTotal <= 0) throw new UserError("Document total must be more than zero");

    if (type === "CREDIT_NOTE" && original) {
      const already = await creditedPaise(tx, original.id, id ?? undefined);
      if (already + totals.grandTotal > toPaise(original.grandTotal.toNumber())) {
        throw new UserError(`Credit notes can't exceed the invoice value (₹${rupees(toPaise(original.grandTotal.toNumber()) - already)} remaining)`);
      }
    }

    const header = {
      date: toDate(input.date),
      dueDate: input.dueDate ? toDate(input.dueDate) : null,
      partyId: party.id,
      partyName: party.name,
      partyGstin: party.gstin,
      partyAddress: party.billingAddress,
      partyState: party.stateCode,
      shippingAddress: input.shippingAddress || party.shippingAddress,
      seller: sellerSnapshot(company),
      placeOfSupply,
      isInterstate,
      reverseCharge: input.reverseCharge,
      pricesIncludeTax: input.pricesIncludeTax,
      taxableTotal: rupees(totals.taxable),
      cgst: rupees(totals.cgst),
      sgst: rupees(totals.sgst),
      igst: rupees(totals.igst),
      roundOff: rupees(totals.roundOff),
      grandTotal: rupees(totals.grandTotal),
      originalDocId: original?.id ?? null,
      noteReason: isNote(type) ? input.noteReason : "",
      notes: input.notes,
    };

    let docId: string;
    if (id) {
      const existing = await tx.document.findFirst({ where: { id, companyId, type } });
      if (!existing) throw new UserError("Document not found");
      if (!canEditDoc(ctx, existing)) throw new UserError("This document can no longer be edited");
      if (type !== "QUOTATION") await assertNotLocked(tx, companyId, existing.date);
      if (financialYear(input.date) !== existing.fy) {
        throw new UserError("Date must stay within the same financial year as the document number", "date");
      }
      if (existing.partyId !== party.id) {
        const linked = await tx.document.count({ where: { originalDocId: id, status: "ISSUED" } });
        const paid = await tx.paymentAllocation.count({ where: { documentId: id } });
        if (linked || paid) throw new UserError("Party can't be changed after payments or notes are recorded");
      }
      if (type === "INVOICE") {
        const allocated = await tx.paymentAllocation.aggregate({ where: { documentId: id }, _sum: { amount: true } });
        const credited = await creditedPaise(tx, id);
        if (toPaise(allocated._sum.amount?.toNumber() ?? 0) + credited > totals.grandTotal) {
          throw new UserError("Invoice total can't be lower than payments and credit notes already recorded against it");
        }
      }
      await tx.document.update({ where: { id }, data: header });
      await tx.documentItem.deleteMany({ where: { documentId: id } });
      docId = id;
    } else {
      const num = await allocateNumber(tx, companyId, type, input.date);
      const created = await tx.document.create({
        data: {
          ...header,
          companyId,
          type,
          number: num.number,
          fy: num.fy,
          seq: num.seq,
          status: type === "QUOTATION" ? "OPEN" : "ISSUED",
          createdById: ctx.user.id,
        },
      });
      docId = created.id;

      if (type === "INVOICE" && input.sourceQuotationId) {
        const marked = await tx.document.updateMany({
          where: { id: input.sourceQuotationId, companyId, type: "QUOTATION", status: { in: ["OPEN", "ACCEPTED"] } },
          data: { status: "CONVERTED", convertedToId: docId },
        });
        if (marked.count !== 1) throw new UserError("Quotation was already converted or cancelled");
      }
    }

    await tx.documentItem.createMany({
      data: lines.map((l, position) => ({
        documentId: docId,
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
      data: { companyId, userId: ctx.user.id, action: id ? "update" : "create", entity: type.toLowerCase(), entityId: docId },
    });
    return docId;
  });
}

// ───────────────────────── Cancel ─────────────────────────

export async function cancelDocument(ctx: CompanyContext, id: string) {
  await runTx(async (tx) => {
    const doc = await tx.document.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!doc) throw new UserError("Document not found");
    if (doc.status === "CANCELLED") return;
    if (doc.type !== "QUOTATION") await assertNotLocked(tx, ctx.companyId, doc.date);
    if (doc.status === "CONVERTED") throw new UserError("A converted quotation can't be cancelled; cancel the invoice instead");
    if (await tx.paymentAllocation.count({ where: { documentId: id } })) {
      throw new UserError("Remove payments recorded against this document first");
    }
    if (await tx.document.count({ where: { originalDocId: id, status: "ISSUED" } })) {
      throw new UserError("Cancel the credit/debit notes issued against this invoice first");
    }
    await tx.document.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    // Re-open the quotation this invoice came from.
    await tx.document.updateMany({ where: { convertedToId: id, companyId: ctx.companyId }, data: { status: "OPEN", convertedToId: null } });
    await tx.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "cancel", entity: doc.type.toLowerCase(), entityId: id } });
  });
}

export async function setQuotationStatus(ctx: CompanyContext, id: string, status: "OPEN" | "ACCEPTED" | "EXPIRED") {
  const r = await db.document.updateMany({
    where: { id, companyId: ctx.companyId, type: "QUOTATION", status: { in: ["OPEN", "ACCEPTED", "EXPIRED"] } },
    data: { status },
  });
  if (r.count !== 1) throw new UserError("Quotation can't be changed");
}

// ───────────────────────── Read ─────────────────────────

/** Loads a document as plain JSON-safe data (money in paise). */
export async function loadDocument(companyId: string, id: string) {
  const d = await db.document.findFirst({
    where: { id, companyId },
    include: {
      items: { orderBy: { position: "asc" } },
      originalDoc: { select: { id: true, number: true, date: true } },
      allocations: { include: { payment: { select: { id: true, date: true, mode: true, reference: true } } } },
      notesOnThis: { where: { status: "ISSUED" }, select: { id: true, type: true, number: true, grandTotal: true } },
    },
  });
  if (!d) return null;
  const p = (v: { toNumber(): number }) => toPaise(v.toNumber());
  const grand = p(d.grandTotal);
  const paid = d.allocations.reduce((a, x) => a + p(x.amount), 0);
  const credited = d.notesOnThis.filter((n) => n.type === "CREDIT_NOTE").reduce((a, n) => a + p(n.grandTotal), 0);
  return {
    id: d.id,
    type: d.type,
    number: d.number,
    fy: d.fy,
    date: isoOf(d.date),
    dueDate: isoOf(d.dueDate),
    status: d.status,
    partyId: d.partyId,
    partyName: d.partyName,
    partyGstin: d.partyGstin,
    partyAddress: d.partyAddress,
    partyState: d.partyState,
    shippingAddress: d.shippingAddress,
    seller: d.seller as unknown as SellerSnapshot,
    placeOfSupply: d.placeOfSupply,
    isInterstate: d.isInterstate,
    reverseCharge: d.reverseCharge,
    pricesIncludeTax: d.pricesIncludeTax,
    taxable: p(d.taxableTotal),
    cgst: p(d.cgst),
    sgst: p(d.sgst),
    igst: p(d.igst),
    roundOff: p(d.roundOff),
    grandTotal: grand,
    paid,
    credited,
    balance: Math.max(0, grand - paid - credited),
    originalDoc: d.originalDoc ? { ...d.originalDoc, date: isoOf(d.originalDoc.date) } : null,
    convertedToId: d.convertedToId,
    noteReason: d.noteReason,
    notes: d.notes ?? "",
    createdById: d.createdById,
    createdAt: d.createdAt,
    payments: d.allocations.map((a) => ({
      paymentId: a.payment.id,
      date: isoOf(a.payment.date),
      mode: a.payment.mode,
      reference: a.payment.reference,
      amount: p(a.amount),
    })),
    notesIssued: d.notesOnThis.map((n) => ({ id: n.id, type: n.type, number: n.number, amount: p(n.grandTotal) })),
    items: d.items.map((i) => ({
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

export type LoadedDocument = NonNullable<Awaited<ReturnType<typeof loadDocument>>>;

export type PaymentStatus = "PAID" | "PARTIAL" | "UNPAID" | "OVERDUE";

export function paymentStatus(doc: { grandTotal: number; balance: number; dueDate: string }): PaymentStatus {
  if (doc.balance <= 0) return "PAID";
  if (doc.dueDate && doc.dueDate < todayIST()) return "OVERDUE";
  return doc.balance < doc.grandTotal ? "PARTIAL" : "UNPAID";
}
