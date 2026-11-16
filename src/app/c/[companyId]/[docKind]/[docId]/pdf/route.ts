import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DOC_KINDS, isDocKind } from "@/lib/doc-kinds";
import { loadDocument } from "@/lib/documents";
import { renderDocumentPdf, type PdfExtraSection } from "@/lib/pdf/document-pdf";
import { activeEntries, applyFilters } from "@/lib/plugins/runner";
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

  const extra = await pluginSections(ctx, doc);
  let pdf: Buffer;
  try {
    pdf = await renderDocumentPdf(doc, logo, extra);
  } catch (err) {
    console.error(`[pdf] failed to render ${doc.number}:`, err);
    // A corrupt/unsupported logo is the most common cause — retry once without it.
    if (logo) {
      try {
        pdf = await renderDocumentPdf(doc, null, extra);
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

/** Custom fields marked "onPdf" plus sections from the pdf.sections filter (plugins can't break the PDF). */
async function pluginSections(ctx: Awaited<ReturnType<typeof requireCompany>>, doc: NonNullable<Awaited<ReturnType<typeof loadDocument>>>): Promise<PdfExtraSection[]> {
  const sections: PdfExtraSection[] = [];
  const onPdf = Object.values(doc.customFields ?? {}).filter((f) => f.onPdf && f.value);
  if (onPdf.length) sections.push({ lines: onPdf.map((f) => `${f.label}: ${f.value}`) });
  try {
    const entries = await activeEntries(ctx.companyId);
    if (!entries.some((e) => e.manifest.filters.includes("pdf.sections"))) return sections;
    const summary = { id: doc.id, type: doc.type, number: doc.number, date: doc.date, status: doc.status, partyId: doc.partyId, partyName: doc.partyName, partyGstin: doc.partyGstin, total: doc.grandTotal / 100, customFields: doc.customFields };
    const added = await applyFilters({ companyId: ctx.companyId, user: ctx.user, role: ctx.role }, "pdf.sections", [], { document: summary });
    for (const sec of added.slice(0, 5)) {
      if (!sec || !Array.isArray(sec.lines)) continue;
      sections.push({ title: sec.title ? String(sec.title).slice(0, 60) : undefined, lines: sec.lines.slice(0, 10).map((l) => String(l).slice(0, 300)) });
    }
  } catch (e) {
    console.error("[pdf] plugin sections skipped:", (e as Error).message);
  }
  return sections;
}
