import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DOC_KINDS, isDocKind } from "@/lib/doc-kinds";
import { loadDocument } from "@/lib/documents";
import { renderDocumentPdf } from "@/lib/pdf/document-pdf";
import { requireCompany } from "@/lib/tenant";

/** Readable error page instead of a blank iframe; details go to the server log. */
function pdfError(err: unknown) {
  const reason = err instanceof Error ? err.message.split("\n")[0].slice(0, 200) : "unknown error";
  return new Response(`Could not generate the PDF.\n\nReason: ${reason}\n\nDetails were written to the server log.`, {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request, { params }: RouteContext<"/c/[companyId]/[docKind]/[docId]/pdf">) {
  const { companyId, docKind, docId } = await params;
  if (!isDocKind(docKind)) notFound();
  const ctx = await requireCompany(companyId);
  const doc = await loadDocument(ctx.companyId, docId);
  if (!doc || doc.type !== DOC_KINDS[docKind].type) notFound();

  const company = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { logo: true, logoMime: true } });
  const logo = company.logo && company.logoMime !== "image/webp" ? { data: Buffer.from(company.logo), mime: company.logoMime ?? "image/png" } : null;

  let pdf: Buffer;
  try {
    pdf = await renderDocumentPdf(doc, logo);
  } catch (err) {
    console.error(`[pdf] failed to render ${doc.number}:`, err);
    // A corrupt/unsupported logo is the most common cause — retry once without it.
    if (logo) {
      try {
        pdf = await renderDocumentPdf(doc, null);
      } catch (err2) {
        console.error(`[pdf] retry without logo also failed:`, err2);
        return pdfError(err2);
      }
    } else {
      return pdfError(err);
    }
  }

  const download = new URL(request.url).searchParams.has("download");
  const filename = `${doc.number.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
