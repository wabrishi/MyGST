import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { financialYear, todayIST } from "@/lib/gst/fy";
import { DEFAULT_PREFIX, DOC_LABEL } from "@/lib/numbering";
import { requireCompanyPage } from "@/lib/tenant";
import { NumberingForm } from "./numbering-form";

export const metadata = { title: "Numbering" };

export default async function NumberingPage({ params }: PageProps<"/c/[companyId]/settings/numbering">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "company.settings");
  const fy = financialYear(todayIST());
  const series = await db.numberSeries.findMany({ where: { companyId: ctx.companyId }, orderBy: { fy: "desc" } });

  const rows = (Object.keys(DEFAULT_PREFIX) as Array<keyof typeof DEFAULT_PREFIX>).map((t) => {
    const current = series.find((s) => s.docType === t && s.fy === fy);
    const latest = series.find((s) => s.docType === t);
    return { type: t, label: DOC_LABEL[t], prefix: (current ?? latest)?.prefix ?? DEFAULT_PREFIX[t], nextSeq: current?.nextSeq ?? 1 };
  });

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Document numbering — FY 20{fy}</h2>
      <p className="mb-4 mt-1 text-xs text-muted">
        Format: PREFIX + FY + sequence, e.g. <code>INV/{fy}/0001</code>. GST rules require unique, consecutive numbers of at most 16
        characters per financial year; numbering restarts every 1 April. Changing a prefix affects new documents only.
      </p>
      <NumberingForm companyId={ctx.companyId} fy={fy} rows={rows} />
    </Card>
  );
}
