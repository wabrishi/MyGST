import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { DOC_KINDS, isDocKind } from "@/lib/doc-kinds";
import { loadDocument } from "@/lib/documents";
import { todayIST } from "@/lib/gst/fy";
import { peekNumber } from "@/lib/numbering";
import { requireCompanyPage } from "@/lib/tenant";
import { DocForm, type DocFormInitial } from "../doc-form";
import { loadFormMasters } from "../form-data";

export default async function NewDocPage({ params, searchParams }: PageProps<"/c/[companyId]/[docKind]/new">) {
  const { companyId, docKind } = await params;
  if (!isDocKind(docKind)) notFound();
  const sp = await searchParams;
  const ctx = await requireCompanyPage(companyId, "docs.create");
  const cfg = DOC_KINDS[docKind];
  const company = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { stateCode: true, pricesIncludeTax: true } });
  const today = todayIST();

  const [masters, numberPreview] = await Promise.all([loadFormMasters(ctx.companyId, docKind), peekNumber(db, ctx.companyId, cfg.type, today)]);

  let initial: DocFormInitial = {
    partyId: typeof sp.party === "string" ? sp.party : "",
    date: today,
    dueDate: "",
    placeOfSupply: company.stateCode,
    reverseCharge: false,
    pricesIncludeTax: company.pricesIncludeTax,
    shippingAddress: "",
    notes: "",
    originalDocId: "",
    noteReason: "",
    sourceQuotationId: "",
    items: [],
  };
  let banner: string | null = null;

  // Prefill from a quotation (convert) or an invoice (credit/debit note against it).
  const sourceId = typeof sp.from === "string" ? sp.from : null;
  if (sourceId) {
    const src = await loadDocument(ctx.companyId, sourceId);
    if (src) {
      const base = {
        ...initial,
        partyId: src.partyId,
        placeOfSupply: src.placeOfSupply,
        pricesIncludeTax: src.pricesIncludeTax,
        shippingAddress: src.shippingAddress,
        items: src.items.map(({ productId, description, hsnSac, unit, qty, rate, discountPct, gstRate }) => ({
          productId, description, hsnSac, unit, qty, rate, discountPct, gstRate,
        })),
      };
      if (docKind === "invoices" && src.type === "QUOTATION" && ["OPEN", "ACCEPTED"].includes(src.status)) {
        initial = { ...base, notes: src.notes, sourceQuotationId: src.id };
        banner = `Converting quotation ${src.number} into an invoice.`;
      } else if ((docKind === "credit-notes" || docKind === "debit-notes") && src.type === "INVOICE" && src.status === "ISSUED") {
        initial = { ...base, originalDocId: src.id, noteReason: docKind === "credit-notes" ? "Sales Return" : "" };
        banner = `Against invoice ${src.number}. Adjust items/quantities to the amount being ${docKind === "credit-notes" ? "credited" : "debited"}.`;
      }
    }
  }

  return (
    <>
      <PageHeader title={`New ${cfg.singular.toLowerCase()}`} />
      {banner && (
        <div className="mb-4">
          <Alert kind="info">{banner}</Alert>
        </div>
      )}
      {masters.parties.length === 0 && (
        <div className="mb-4">
          <Alert kind="warning">Add a customer under Parties before creating documents.</Alert>
        </div>
      )}
      <DocForm
        companyId={ctx.companyId}
        kind={docKind}
        docId={null}
        numberPreview={numberPreview}
        companyState={company.stateCode}
        {...masters}
        initial={initial}
      />
    </>
  );
}
