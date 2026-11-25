import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { pdfFileName, sharedDocumentPdf } from "@/lib/share-pdf";
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
  let pdf: Buffer | null;
  try {
    pdf = await sharedDocumentPdf(share, sender);
  } catch (err) {
    console.error(`[pdf] received ${share.number} failed:`, err);
    return new Response("Could not generate the PDF.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (!pdf) notFound();
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdfFileName(share.number)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
