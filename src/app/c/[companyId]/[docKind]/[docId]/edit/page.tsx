import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { DOC_KINDS, isDocKind } from "@/lib/doc-kinds";
import { canEditDoc, loadDocument } from "@/lib/documents";
import { requireCompanyPage } from "@/lib/tenant";
import { DocForm } from "../../doc-form";
import { loadFormMasters } from "../../form-data";

export default async function EditDocPage({ params }: PageProps<"/c/[companyId]/[docKind]/[docId]/edit">) {
  const { companyId, docKind, docId } = await params;
  if (!isDocKind(docKind)) notFound();
  const ctx = await requireCompanyPage(companyId, "docs.create");
  const doc = await loadDocument(ctx.companyId, docId);
  if (!doc || doc.type !== DOC_KINDS[docKind].type) notFound();
  if (!canEditDoc(ctx, doc)) {
    return <Alert>This document can no longer be edited (cancelled, converted, or outside your edit permission).</Alert>;
  }
  const [masters, company] = await Promise.all([
    loadFormMasters(ctx.companyId, docKind),
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { stateCode: true } }),
  ]);
  // Keep inactive party selectable when editing an older document.
  if (!masters.parties.some((p) => p.id === doc.partyId)) {
    const p = await db.party.findFirst({
      where: { id: doc.partyId, companyId: ctx.companyId },
      select: { id: true, name: true, gstin: true, stateCode: true, shippingState: true, shippingAddress: true, creditDays: true },
    });
    if (p) masters.parties.unshift(p);
  }

  return (
    <>
      <PageHeader title={`Edit ${DOC_KINDS[docKind].singular.toLowerCase()} ${doc.number}`} />
      {(doc.payments.length > 0 || doc.notesIssued.length > 0) && (
        <div className="mb-4">
          <Alert kind="warning">Payments or notes are linked to this document. Make sure changes are reflected in your GST returns.</Alert>
        </div>
      )}
      <DocForm
        companyId={ctx.companyId}
        kind={docKind}
        docId={doc.id}
        numberPreview={doc.number}
        companyState={company.stateCode}
        {...masters}
        initial={{
          partyId: doc.partyId,
          date: doc.date,
          dueDate: doc.dueDate,
          placeOfSupply: doc.placeOfSupply,
          reverseCharge: doc.reverseCharge,
          pricesIncludeTax: doc.pricesIncludeTax,
          shippingAddress: doc.shippingAddress,
          notes: doc.notes,
          originalDocId: doc.originalDoc?.id ?? "",
          noteReason: doc.noteReason,
          sourceQuotationId: "",
          items: doc.items.map(({ productId, description, hsnSac, unit, qty, rate, discountPct, gstRate }) => ({
            productId, description, hsnSac, unit, qty, rate, discountPct, gstRate,
          })),
        }}
      />
    </>
  );
}
