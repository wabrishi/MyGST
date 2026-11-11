import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireCompanyPage } from "@/lib/tenant";

export const metadata = { title: "Reports" };

const REPORTS = [
  ["gstr1", "GSTR-1", "Outward supplies: B2B, B2CL, B2CS, credit/debit notes, HSN summary, documents issued. CSV per section for the offline tool."],
  ["gstr3b", "GSTR-3B summary", "Tax liability on outward supplies, reverse charge, eligible ITC and net tax payable."],
  ["sales-register", "Sales register", "All invoices, credit and debit notes with tax break-up."],
  ["purchase-register", "Purchase register", "All purchase bills with ITC classification."],
  ["outstanding", "Outstanding & ageing", "Receivables and payables by party, aged 0–30 / 31–60 / 61–90 / 90+ days."],
  ["ledger", "Party ledger", "Statement of account for a customer or supplier with running balance."],
] as const;

export default async function ReportsPage({ params }: PageProps<"/c/[companyId]/reports">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "reports.view");
  return (
    <>
      <PageHeader title="Reports" subtitle="All reports default to the financial year selected in the sidebar." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map(([slug, title, desc]) => (
          <Link key={slug} href={`/c/${ctx.companyId}/reports/${slug}`}>
            <Card className="h-full p-4 transition-colors hover:border-primary">
              <h2 className="font-semibold text-primary">{title}</h2>
              <p className="mt-1 text-muted">{desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
