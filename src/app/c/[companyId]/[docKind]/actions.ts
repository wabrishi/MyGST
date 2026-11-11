"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { DOC_KINDS, isDocKind, kindOfType } from "@/lib/doc-kinds";
import { cancelDocument, isoOf, loadDocument, saveDocument, setQuotationStatus, type DocInput } from "@/lib/documents";
import { formatPaise, toPaise } from "@/lib/gst/calc";
import { escapeHtml, mailEnabled, sendMail } from "@/lib/mail";
import { renderDocumentPdf } from "@/lib/pdf/document-pdf";
import { requireCompany } from "@/lib/tenant";

export async function saveDoc(companyId: string, kind: string, id: string | null, input: DocInput): Promise<ActionResult<{ id: string }>> {
  const res = await run(async () => {
    if (!isDocKind(kind)) throw new UserError("Unknown document type");
    const ctx = await requireCompany(companyId, "docs.create");
    const docId = await saveDocument(ctx, DOC_KINDS[kind].type, id, input);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok({ id: docId });
  });
  if (res.ok) redirect(`/c/${companyId}/${kind}/${res.data.id}`);
  return res;
}

export async function cancelDoc(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "docs.cancel");
    await cancelDocument(ctx, id);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok(undefined, "Document cancelled");
  });
}

export async function updateQuotationStatus(companyId: string, id: string, status: "OPEN" | "ACCEPTED" | "EXPIRED"): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "docs.create");
    await setQuotationStatus(ctx, id, status);
    revalidatePath(`/c/${ctx.companyId}/quotations`);
    return ok(undefined);
  });
}

/** Issued invoices of a party, for linking credit/debit notes. */
export async function invoicesForParty(companyId: string, partyId: string) {
  const ctx = await requireCompany(companyId, "docs.create");
  const rows = await db.document.findMany({
    where: { companyId: ctx.companyId, partyId, type: "INVOICE", status: "ISSUED" },
    orderBy: { date: "desc" },
    take: 200,
    select: { id: true, number: true, date: true, grandTotal: true, placeOfSupply: true },
  });
  return rows.map((r) => ({ id: r.id, number: r.number, date: isoOf(r.date), total: toPaise(r.grandTotal.toNumber()), placeOfSupply: r.placeOfSupply }));
}

export async function emailDoc(companyId: string, id: string, to: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "docs.create");
    const email = z.email("Enter a valid email").parse(to.trim());
    const doc = await loadDocument(ctx.companyId, id);
    if (!doc) throw new UserError("Document not found");
    const company = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { logo: true, logoMime: true } });
    const logo = company.logo && company.logoMime !== "image/webp" ? { data: Buffer.from(company.logo), mime: company.logoMime ?? "image/png" } : null;
    // Fall back to no logo if the stored image can't be embedded.
    const pdf = await renderDocumentPdf(doc, logo).catch((err) => {
      console.error(`[pdf] email render failed for ${doc.number}, retrying without logo:`, err);
      return renderDocumentPdf(doc, null);
    });
    const kind = DOC_KINDS[kindOfType(doc.type)];
    const from = doc.seller.tradeName || doc.seller.legalName;
    await sendMail({
      to: email,
      subject: `${kind.singular} ${doc.number} from ${from}`,
      html: `<p>Dear ${escapeHtml(doc.partyName)},</p><p>Please find attached ${kind.singular.toLowerCase()} <b>${escapeHtml(doc.number)}</b> dated ${doc.date} for <b>₹${formatPaise(doc.grandTotal)}</b>.</p><p>Regards,<br>${escapeHtml(from)}</p>`,
      attachments: [{ filename: `${doc.number.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    await audit(ctx, "email", doc.type.toLowerCase(), id, { to: email });
    return ok(undefined, mailEnabled() ? `Sent to ${email}` : `Email not configured — logged to server console`);
  });
}
