import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DOC_KINDS, isDocKind } from "@/lib/doc-kinds";
import { loadDocument } from "@/lib/documents";
import { renderDocumentPdf } from "@/lib/pdf/document-pdf";
import { requireCompany } from "@/lib/tenant";

export async function GET(request: Request, { params }: RouteContext<"/c/[companyId]/[docKind]/[docId]/pdf">) {
  const { companyId, docKind, docId } = await params;
  if (!isDocKind(docKind)) notFound();
  const ctx = await requireCompany(companyId);
  const doc = await loadDocument(ctx.companyId, docId);
  if (!doc || doc.type !== DOC_KINDS[docKind].type) notFound();

  const company = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { logo: true, logoMime: true } });
  const logo = company.logo && company.logoMime !== "image/webp" ? { data: Buffer.from(company.logo), mime: company.logoMime ?? "image/png" } : null;
  const pdf = await renderDocumentPdf(doc, logo);

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
