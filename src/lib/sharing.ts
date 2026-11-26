import "server-only";
import type { DocType, Prisma, SharedKind } from "@/generated/prisma/client";
import { db, type Tx } from "./db";
import { sendTemplate } from "./email-render";
import { formatINR, toPaise } from "./gst/calc";
import { findNetworkCompany } from "./network";
import { MATCH_WINDOW_DAYS, rankMatches } from "./payment-match";
import { BUILTIN_ROLE_ID } from "./permissions";

/**
 * Documents shared between companies on MyGSTBook. When a company issues an invoice, note or quotation
 * to a party whose GSTIN belongs to another company here (or sends a purchase order to such a supplier),
 * that company receives it in its Received inbox. Nothing enters the receiver's books until they accept.
 */

export const KIND_LABEL: Record<SharedKind, string> = {
  INVOICE: "Invoice",
  CREDIT_NOTE: "Credit note",
  DEBIT_NOTE: "Debit note",
  QUOTATION: "Quotation",
  PURCHASE_ORDER: "Purchase order",
  PAYMENT: "Payment",
};

export interface SharedLine {
  description: string;
  hsnSac: string;
  qty: number;
  unit: string;
  rate: number;
  discountPct: number;
  gstRate: number;
  taxable: number;
  total: number;
}

/** What the receiver sees (frozen when sent, refreshed when the sender edits). Money in rupees. */
export interface SharedSnapshot {
  from: { name: string; legalName: string; gstin: string; address: string; stateCode: string; email: string; phone: string };
  /** The receiver as the sender recorded them. */
  to: { name: string; gstin: string };
  number: string;
  date: string;
  dueDate: string;
  expectedDate: string;
  placeOfSupply: string;
  isInterstate: boolean;
  pricesIncludeTax: boolean;
  items: SharedLine[];
  totals: { taxable: number; cgst: number; sgst: number; igst: number; roundOff: number; grandTotal: number };
  notes: string;
  /** Notes: the invoice they adjust, and why. */
  originalNumber: string;
  reason: string;
  /** Purchase orders: where and when to deliver. */
  deliveryAddress: string;
  paymentTerms: string;
  /** Payments: how it was paid and which of the receiver's invoices it settles (by their number). */
  payment?: { mode: string; reference: string; against: Array<{ number: string; amount: number }> };
}

const KIND_OF: Partial<Record<DocType, SharedKind>> = { INVOICE: "INVOICE", CREDIT_NOTE: "CREDIT_NOTE", DEBIT_NOTE: "DEBIT_NOTE", QUOTATION: "QUOTATION" };
const n = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : 0);
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

type Upsert = { fromCompanyId: string; kind: SharedKind; sourceId: string; toCompanyId: string; number: string; date: Date; total: number; snapshot: SharedSnapshot };

/** Creates or refreshes a share. Returns the id when it's new (so the receiver can be told). */
async function upsertShare(tx: Tx, s: Upsert): Promise<string | null> {
  const key = { fromCompanyId_kind_sourceId: { fromCompanyId: s.fromCompanyId, kind: s.kind, sourceId: s.sourceId } };
  const existing = await tx.sharedDocument.findUnique({ where: key });
  const data = { number: s.number, date: s.date, total: s.total, snapshot: s.snapshot as unknown as Prisma.InputJsonValue };
  if (existing && existing.toCompanyId === s.toCompanyId) {
    // Withdrawn and issued again → back in the inbox; otherwise it's an edit.
    const reopened = existing.status === "WITHDRAWN";
    await tx.sharedDocument.update({ where: { id: existing.id }, data: { ...data, ...(reopened ? { status: "NEW", readAt: null } : { updatedBySender: true }) } });
    return reopened ? existing.id : null;
  }
  if (existing) await tx.sharedDocument.delete({ where: { id: existing.id } }); // addressed to another company now
  const created = await tx.sharedDocument.create({ data: { ...data, fromCompanyId: s.fromCompanyId, toCompanyId: s.toCompanyId, kind: s.kind, sourceId: s.sourceId } });
  return created.id;
}

/** The sender took it back (cancelled, or the party isn't on MyGSTBook any more). */
export async function withdrawShare(tx: Tx, fromCompanyId: string, kind: SharedKind, sourceId: string) {
  await tx.sharedDocument.updateMany({ where: { fromCompanyId, kind, sourceId, status: { not: "WITHDRAWN" } }, data: { status: "WITHDRAWN" } });
}

/** After a sales document is saved: share it with the customer's company, if they're on MyGSTBook. */
export async function syncDocumentShare(tx: Tx, companyId: string, docId: string): Promise<string | null> {
  const doc = await tx.document.findFirst({ where: { id: docId, companyId }, include: { items: { orderBy: { position: "asc" } }, originalDoc: { select: { number: true } } } });
  const kind = doc && KIND_OF[doc.type];
  if (!doc || !kind) return null;
  if (doc.status === "CANCELLED") {
    await withdrawShare(tx, companyId, kind, docId);
    return null;
  }
  const to = await findNetworkCompany(doc.partyGstin, companyId, tx);
  if (!to) {
    await withdrawShare(tx, companyId, kind, docId);
    return null;
  }
  const seller = doc.seller as Record<string, string>;
  const snapshot: SharedSnapshot = {
    from: {
      name: seller.tradeName || seller.legalName,
      legalName: seller.legalName,
      gstin: seller.gstin ?? "",
      address: [seller.address, seller.city, seller.pincode].filter(Boolean).join(", "),
      stateCode: seller.stateCode ?? "",
      email: seller.email ?? "",
      phone: seller.phone ?? "",
    },
    to: { name: doc.partyName, gstin: doc.partyGstin },
    number: doc.number,
    date: iso(doc.date),
    dueDate: iso(doc.dueDate),
    expectedDate: "",
    placeOfSupply: doc.placeOfSupply,
    isInterstate: doc.isInterstate,
    pricesIncludeTax: doc.pricesIncludeTax,
    items: doc.items.map((i) => ({
      description: i.description,
      hsnSac: i.hsnSac,
      qty: n(i.qty),
      unit: i.unit,
      rate: n(i.rate),
      discountPct: n(i.discountPct),
      gstRate: n(i.gstRate),
      taxable: n(i.taxable),
      total: n(i.total),
    })),
    totals: { taxable: n(doc.taxableTotal), cgst: n(doc.cgst), sgst: n(doc.sgst), igst: n(doc.igst), roundOff: n(doc.roundOff), grandTotal: n(doc.grandTotal) },
    notes: doc.notes ?? "",
    originalNumber: doc.originalDoc?.number ?? "",
    reason: doc.noteReason ?? "",
    deliveryAddress: "",
    paymentTerms: "",
  };
  return upsertShare(tx, { fromCompanyId: companyId, kind, sourceId: docId, toCompanyId: to.id, number: doc.number, date: doc.date, total: n(doc.grandTotal), snapshot });
}

/** After a purchase order is saved: send it to the supplier's company, if they're on MyGSTBook. */
export async function syncPurchaseOrderShare(tx: Tx, companyId: string, poId: string): Promise<string | null> {
  const po = await tx.purchaseOrder.findFirst({ where: { id: poId, companyId }, include: { items: { orderBy: { position: "asc" } }, company: true } });
  if (!po) return null;
  if (po.status === "CANCELLED") {
    await withdrawShare(tx, companyId, "PURCHASE_ORDER", poId);
    return null;
  }
  const to = await findNetworkCompany(po.partyGstin, companyId, tx);
  if (!to) {
    await withdrawShare(tx, companyId, "PURCHASE_ORDER", poId);
    return null;
  }
  const c = po.company;
  const snapshot: SharedSnapshot = {
    from: {
      name: c.tradeName || c.legalName,
      legalName: c.legalName,
      gstin: c.gstin,
      address: [c.address, c.city, c.pincode].filter(Boolean).join(", "),
      stateCode: c.stateCode,
      email: c.email,
      phone: c.phone,
    },
    to: { name: po.partyName, gstin: po.partyGstin },
    number: po.number,
    date: iso(po.date),
    dueDate: "",
    expectedDate: iso(po.expectedDate),
    placeOfSupply: po.placeOfSupply,
    isInterstate: po.isInterstate,
    pricesIncludeTax: po.pricesIncludeTax,
    items: po.items.map((i) => ({
      description: i.description,
      hsnSac: i.hsnSac,
      qty: n(i.qty),
      unit: i.unit,
      rate: n(i.rate),
      discountPct: n(i.discountPct),
      gstRate: n(i.gstRate),
      taxable: n(i.taxable),
      total: n(i.total),
    })),
    totals: { taxable: n(po.taxableTotal), cgst: n(po.cgst), sgst: n(po.sgst), igst: n(po.igst), roundOff: n(po.roundOff), grandTotal: n(po.grandTotal) },
    notes: po.notes ?? "",
    originalNumber: "",
    reason: "",
    deliveryAddress: po.deliveryAddress,
    paymentTerms: po.paymentTerms,
  };
  return upsertShare(tx, { fromCompanyId: companyId, kind: "PURCHASE_ORDER", sourceId: poId, toCompanyId: to.id, number: po.number, date: po.date, total: n(po.grandTotal), snapshot });
}

/** "18 Nov 2026" */
const dayLabel = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The label a shared payment goes by (payments have no number): its reference, or its date. */
export const paymentLabel = (reference: string, date: Date) => (reference.trim() || `dated ${dayLabel(date)}`).slice(0, 30);

/**
 * After a payment MADE is saved: tell the supplier's company, if it's on MyGSTBook. It arrives in their
 * Received inbox; once they confirm it, it becomes a payment received in their books.
 */
export async function syncPaymentShare(tx: Tx, companyId: string, paymentId: string): Promise<string | null> {
  const p = await tx.payment.findFirst({
    where: { id: paymentId, companyId },
    include: { company: true, party: { select: { name: true, gstin: true } }, allocations: { include: { purchaseBill: { select: { billNumber: true } } } } },
  });
  if (!p || p.direction !== "PAID") return null;
  const to = await findNetworkCompany(p.party.gstin, companyId, tx);
  if (!to) return null;
  const c = p.company;
  const amount = n(p.amount);
  const snapshot: SharedSnapshot = {
    from: {
      name: c.tradeName || c.legalName,
      legalName: c.legalName,
      gstin: c.gstin,
      address: [c.address, c.city, c.pincode].filter(Boolean).join(", "),
      stateCode: c.stateCode,
      email: c.email,
      phone: c.phone,
    },
    to: { name: p.party.name, gstin: p.party.gstin },
    number: paymentLabel(p.reference, p.date),
    date: iso(p.date),
    dueDate: "",
    expectedDate: "",
    placeOfSupply: "",
    isInterstate: false,
    pricesIncludeTax: false,
    items: [],
    totals: { taxable: 0, cgst: 0, sgst: 0, igst: 0, roundOff: 0, grandTotal: amount },
    notes: p.notes ?? "",
    originalNumber: "",
    reason: "",
    deliveryAddress: "",
    paymentTerms: "",
    // The payer's purchase-invoice numbers are the receiver's own invoice numbers.
    payment: { mode: p.mode, reference: p.reference, against: p.allocations.filter((a) => a.purchaseBill).map((a) => ({ number: a.purchaseBill!.billNumber, amount: n(a.amount) })) },
  };
  return upsertShare(tx, { fromCompanyId: companyId, kind: "PAYMENT", sourceId: p.id, toCompanyId: to.id, number: snapshot.number, date: p.date, total: amount, snapshot });
}

/**
 * Our own payments received that a shared payment may already be recorded as (B entered it by hand
 * before A told us). Unmatched, same customer, within the date window; same amount first.
 */
export async function matchCandidates(tx: Tx | typeof db, companyId: string, share: { id: string; date: Date; total: { toNumber(): number }; snapshot: SharedSnapshot }) {
  const party = await tx.party.findFirst({ where: { companyId, gstin: share.snapshot.from.gstin }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!party) return [];
  const day = 86_400_000;
  const rows = await tx.payment.findMany({
    where: {
      companyId,
      partyId: party.id,
      direction: "RECEIVED",
      date: { gte: new Date(share.date.getTime() - MATCH_WINDOW_DAYS * day), lte: new Date(share.date.getTime() + MATCH_WINDOW_DAYS * day) },
    },
    select: { id: true, date: true, amount: true, mode: true, reference: true },
    take: 100,
  });
  const used = await tx.sharedDocument.findMany({
    where: { toCompanyId: companyId, kind: "PAYMENT", id: { not: share.id }, acceptedRefId: { in: rows.map((r) => r.id) } },
    select: { acceptedRefId: true },
  });
  return rankMatches(
    rows.map((r) => ({ id: r.id, date: iso(r.date), amount: toPaise(n(r.amount)), mode: r.mode, reference: r.reference })),
    { date: iso(share.date), amount: toPaise(share.total.toNumber()) },
    new Set(used.map((u) => u.acceptedRefId!)),
  );
}

/** Emails the receiving company's owners that a document arrived (never throws). */
export async function notifyShareReceived(shareId: string | null) {
  if (!shareId) return;
  try {
    const s = await db.sharedDocument.findUnique({ where: { id: shareId }, include: { fromCompany: true, toCompany: true } });
    if (!s) return;
    const owners = await db.membership.findMany({
      where: { companyId: s.toCompanyId, roles: { some: { roleId: BUILTIN_ROLE_ID.OWNER } }, user: { disabledAt: null } },
      select: { user: { select: { email: true } } },
    });
    if (!owners.length) return;
    const base = (process.env.APP_URL || process.env.BETTER_AUTH_URL || "").replace(/\/+$/, "");
    // The sender's PDF goes along as an attachment (the email still goes out if it can't be made).
    const { pdfFileName, sharedDocumentPdf } = await import("./share-pdf"); // loaded here: share-pdf imports documents.ts, which imports this file
    const pdf = await sharedDocumentPdf(s, s.fromCompany).catch((e) => {
      console.error("[sharing] PDF for notification failed:", (e as Error).message);
      return null;
    });
    const attachments = pdf ? [{ filename: pdfFileName(s.number), content: pdf, contentType: "application/pdf" }] : [];
    for (const o of owners) {
      await sendTemplate("document_received", o.user.email, {
        companyName: s.toCompany.tradeName || s.toCompany.legalName,
        fromCompany: s.fromCompany.tradeName || s.fromCompany.legalName,
        docType: KIND_LABEL[s.kind].toLowerCase(),
        number: s.number,
        total: formatINR(toPaise(n(s.total))),
        url: `${base}/c/${s.toCompanyId}/received/${s.id}`,
        attached: attachments.length ? "yes" : "",
      }, { attachments });
    }
  } catch (e) {
    console.error("[sharing] notify failed:", (e as Error).message);
  }
}

/** One share addressed to this company. */
export async function loadReceived(companyId: string, id: string) {
  const s = await db.sharedDocument.findFirst({ where: { id, toCompanyId: companyId }, include: { fromCompany: { select: { id: true, legalName: true, tradeName: true, gstin: true } } } });
  return s ? { ...s, snapshot: s.snapshot as unknown as SharedSnapshot } : null;
}

/** How the sender sees a share on their own document page. */
export async function shareStatusFor(fromCompanyId: string, kind: SharedKind, sourceId: string) {
  const s = await db.sharedDocument.findUnique({
    where: { fromCompanyId_kind_sourceId: { fromCompanyId, kind, sourceId } },
    include: { toCompany: { select: { legalName: true, tradeName: true } } },
  });
  return s ? { to: s.toCompany.tradeName || s.toCompany.legalName, status: s.status, readAt: s.readAt, actedAt: s.actedAt, rejectReason: s.rejectReason } : null;
}

/** Received documents the receiver hasn't dealt with yet (sidebar badge). */
export const unreadReceivedCount = (companyId: string, kinds: SharedKind[]) =>
  kinds.length ? db.sharedDocument.count({ where: { toCompanyId: companyId, status: "NEW", kind: { in: kinds } } }).catch(() => 0) : Promise.resolve(0);

// ───────────────────────── Receiver ─────────────────────────

/** What each kind becomes in the receiver's books. */
export const ACCEPT_AS: Record<SharedKind, "purchase" | "purchaseOrder" | "sale" | "paymentReceived" | null> = {
  INVOICE: "purchase",
  QUOTATION: "purchaseOrder",
  PURCHASE_ORDER: "sale",
  CREDIT_NOTE: null,
  DEBIT_NOTE: null,
  PAYMENT: "paymentReceived",
};

/**
 * The sender as a party in the receiver's books: found by GSTIN, or created from the sender's details.
 * A customer who now also supplies (or the other way round) becomes BOTH.
 */
export async function counterpartyFor(tx: Tx, companyId: string, from: SharedSnapshot["from"], role: "SUPPLIER" | "CUSTOMER") {
  const existing = await tx.party.findFirst({ where: { companyId, gstin: from.gstin }, orderBy: { createdAt: "asc" } });
  if (existing) {
    if (existing.type !== role && existing.type !== "BOTH") await tx.party.update({ where: { id: existing.id }, data: { type: "BOTH" } });
    if (!existing.active) await tx.party.update({ where: { id: existing.id }, data: { active: true } });
    return existing.id;
  }
  const party = await tx.party.create({
    data: {
      companyId,
      type: role,
      name: from.legalName || from.name,
      gstin: from.gstin,
      stateCode: /^\d{2}/.test(from.gstin) ? from.gstin.slice(0, 2) : from.stateCode,
      billingAddress: from.address.slice(0, 500),
      email: from.email,
      phone: from.phone,
    },
  });
  return party.id;
}

/** The receiver created its own document from a share: mark it accepted (inside that save). */
export async function acceptShare(tx: Tx, companyId: string, shareId: string | undefined, kind: SharedKind, refId: string, userId: string) {
  if (!shareId) return;
  await tx.sharedDocument.updateMany({
    where: { id: shareId, toCompanyId: companyId, kind, status: { in: ["NEW", "REJECTED"] } },
    data: { status: "ACCEPTED", acceptedRefId: refId, actedAt: new Date(), actedBy: userId, updatedBySender: false },
  });
}

/** Lines for the receiver's own form (they pick their own products if they like). */
export const prefillLines = (s: SharedSnapshot) =>
  s.items.map((i) => ({ productId: null, description: i.description, hsnSac: i.hsnSac, unit: i.unit, qty: i.qty, rate: i.rate, discountPct: i.discountPct, gstRate: i.gstRate }));
