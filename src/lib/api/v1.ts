import "server-only";
import { z } from "zod";
import { UserError } from "../action";
import { db } from "../db";
import { documentUrl, isoOf, paymentStatus, saveDocument } from "../documents";
import { toPaise } from "../gst/calc";
import { todayIST } from "../gst/fy";
import { isValidGstin, normalizeGstin, stateFromGstin } from "../gst/gstin";
import { isStateCode } from "../gst/states";
import type { CompanyContext } from "../tenant";
import { phoneDigits } from "./normalize";

/** Business logic behind /api/v1 (kept out of the route files so it can be tested directly). */

const str = (max: number) => z.string().trim().max(max, `Max ${max} characters`).optional().default("");

// ───────────────────────── Parties ─────────────────────────

export const partyUpsertSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(150),
  phone: str(30),
  email: str(150),
  gstin: str(20),
  stateCode: str(2),
  billingAddress: str(500),
  externalRef: str(100),
});

export { phoneDigits };

/**
 * Upserts a customer. Match order: GSTIN, then phone (compared on the last 10 digits, so
 * "919876543210" matches a party saved as "98765 43210"), then externalRef. A match only fills
 * fields that are empty in MyGST — data entered by the user is never overwritten.
 */
export async function upsertParty(ctx: CompanyContext, raw: unknown) {
  const input = partyUpsertSchema.parse(raw);
  const gstin = normalizeGstin(input.gstin);
  if (gstin && !isValidGstin(gstin)) throw new UserError("gstin is not a valid GSTIN");
  const email = input.email.toLowerCase();
  if (email && !z.email().safeParse(email).success) throw new UserError("email is not a valid email address");
  const digits = phoneDigits(input.phone);
  if (input.phone && (digits.length < 7 || digits.length > 15)) throw new UserError("phone must have 7–15 digits");
  const stateCode = gstin ? stateFromGstin(gstin) : isStateCode(input.stateCode) ? input.stateCode : ctx.company.stateCode;

  const where = { companyId: ctx.companyId };
  let match = gstin ? await db.party.findFirst({ where: { ...where, gstin } }) : null;
  if (!match && digits.length >= 7) {
    // Compare digits only (stored phones may contain spaces, dashes or "+"); last 10 digits = the subscriber number.
    const last10 = digits.slice(-10);
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM party
      WHERE companyId = ${ctx.companyId} AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) = ${last10}
      ORDER BY createdAt ASC LIMIT 1`;
    match = rows[0] ? await db.party.findUnique({ where: { id: rows[0].id } }) : null;
  }
  if (!match && input.externalRef) match = await db.party.findFirst({ where: { ...where, externalRef: input.externalRef } });

  if (match) {
    const fill: Record<string, unknown> = {};
    if (!match.phone && digits) fill.phone = digits;
    if (!match.email && email) fill.email = email;
    if (!match.billingAddress && input.billingAddress) fill.billingAddress = input.billingAddress;
    if (!match.externalRef && input.externalRef) fill.externalRef = input.externalRef;
    if (!match.gstin && gstin) {
      fill.gstin = gstin;
      fill.stateCode = stateCode; // GSTIN decides the state
    }
    if (match.type === "SUPPLIER") fill.type = "BOTH";
    if (!match.active) fill.active = true;
    if (Object.keys(fill).length) {
      await db.party.update({ where: { id: match.id }, data: fill });
      await db.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "api_update", entity: "party", entityId: match.id } });
    }
    return { id: match.id, created: false };
  }

  const party = await db.party.create({
    data: {
      companyId: ctx.companyId,
      type: "CUSTOMER",
      name: input.name,
      gstin,
      phone: digits,
      email,
      billingAddress: input.billingAddress,
      stateCode,
      externalRef: input.externalRef || null,
    },
  });
  await db.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "api_create", entity: "party", entityId: party.id } });
  return { id: party.id, created: true };
}

// ───────────────────────── Quotations ─────────────────────────

export const quotationSchema = z.object({
  partyId: z.string().min(1, "partyId is required").max(40),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1, "item name is required").max(300),
        hsn: z.string().trim().max(8).optional().default(""),
        qty: z.coerce.number().positive("qty must be more than 0"),
        rate: z.coerce.number().min(0, "rate can't be negative"),
        gstRate: z.coerce.number().min(0).max(100),
      }),
    )
    .min(1, "add at least one item")
    .max(200),
  notes: str(2000),
  leadRef: str(100),
});

/** Creates a normal quotation (GST engine + FY numbering) from free-text lines. */
export async function createQuotation(ctx: CompanyContext, raw: unknown) {
  const input = quotationSchema.parse(raw);
  const party = await db.party.findFirst({ where: { id: input.partyId, companyId: ctx.companyId }, select: { id: true, stateCode: true, shippingState: true } });
  if (!party) throw new UserError("partyId not found in this company");

  const id = await saveDocument(
    ctx,
    "QUOTATION",
    null,
    {
      partyId: party.id,
      date: todayIST(),
      placeOfSupply: party.shippingState || party.stateCode,
      notes: input.notes,
      items: input.items.map((i) => ({ description: i.name, hsnSac: i.hsn, qty: i.qty, rate: i.rate, gstRate: i.gstRate, unit: "NOS" })),
    },
    { externalRef: input.leadRef },
  );
  const doc = await db.document.findUniqueOrThrow({ where: { id }, select: { number: true, grandTotal: true } });
  return { id, number: doc.number, url: documentUrl(ctx.companyId, "QUOTATION", id), total: doc.grandTotal.toNumber() };
}

// ───────────────────────── Documents by leadRef ─────────────────────────

/**
 * Quotations and invoices linked to a Lead Manager lead. Invoices converted from a linked quotation
 * inherit its leadRef. For issued invoices `status` is the payment status (UNPAID/PARTIAL/PAID/OVERDUE).
 */
export async function documentsByLeadRef(ctx: CompanyContext, leadRef: string) {
  const ref = leadRef.trim();
  if (!ref) throw new UserError("leadRef is required");
  const docs = await db.document.findMany({
    where: { companyId: ctx.companyId, externalRef: ref },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      allocations: { select: { amount: true } },
      notesOnThis: { where: { status: "ISSUED", type: "CREDIT_NOTE" }, select: { grandTotal: true } },
    },
  });
  return docs.map((d) => {
    const grand = toPaise(d.grandTotal.toNumber());
    const settled = d.allocations.reduce((a, x) => a + toPaise(x.amount.toNumber()), 0) + d.notesOnThis.reduce((a, x) => a + toPaise(x.grandTotal.toNumber()), 0);
    const status =
      d.type === "INVOICE" && d.status === "ISSUED" ? paymentStatus({ grandTotal: grand, balance: Math.max(0, grand - settled), dueDate: isoOf(d.dueDate) }) : d.status;
    return { id: d.id, kind: d.type, number: d.number, total: d.grandTotal.toNumber(), status, url: documentUrl(ctx.companyId, d.type, d.id), date: isoOf(d.date) };
  });
}
