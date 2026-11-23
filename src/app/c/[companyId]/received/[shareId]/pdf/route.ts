import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadDocument } from "@/lib/documents";
import { renderDocumentPdf } from "@/lib/pdf/document-pdf";
import { purchaseOrderPdfFor } from "@/lib/pdf/purchase-order-pdf";
import { loadPurchaseOrder } from "@/lib/purchase-orders";
import { loadReceived } from "@/lib/sharing";
import { requireCompany } from "@/lib/tenant";
import { visibleKinds } from "../../access";

/**
 * The sender's own PDF of a document addressed to this company. Access: the share must be addressed to
 * this company and its kind visible to the member; the sender's document is read by its exact id.
 */
export async function GET(request: Request, { params }: RouteContext<"/c/[companyId]/received/[shareId]/pdf">) {
  const { companyId, shareId } = await params;
  const ctx = await requireCompany(companyId);
  const share = await loadReceived(ctx.companyId, shareId);
  if (!share || !visibleKinds(ctx).includes(share.kind)) notFound();

  const sender = await db.company.findUniqueOrThrow({ where: { id: share.fromCompanyId } });
  let pdf: Buffer;
  try {
    if (share.kind === "PURCHASE_ORDER") {
      const po = await loadPurchaseOrder(share.fromCompanyId, share.sourceId);
      if (!po) notFound();
      pdf = await purchaseOrderPdfFor(po, sender);
    } else {
      const doc = await loadDocument(share.fromCompanyId, share.sourceId);
      if (!doc) notFound();
      const logo = sender.logo && sender.logoMime !== "image/webp" ? { data: Buffer.from(sender.logo), mime: sender.logoMime ?? "image/png" } : null;
      pdf = await renderDocumentPdf(doc, logo).catch(() => renderDocumentPdf(doc, null));
    }
  } catch (err) {
    console.error(`[pdf] received ${share.number} failed:`, err);
    return new Response("Could not generate the PDF.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${share.number.replace(/[^A-Za-z0-9-]/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
