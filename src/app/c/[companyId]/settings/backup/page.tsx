import { BackupPanel } from "@/components/backup-panel";
import { Card } from "@/components/ui";
import { requireCompanyPage } from "@/lib/tenant";

export const metadata = { title: "Backup" };

export default async function CompanyBackupPage({ params, searchParams }: PageProps<"/c/[companyId]/settings/backup">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "company.settings");
  const sp = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      <BackupPanel
        scope="company"
        companyId={ctx.companyId}
        sp={sp}
        description={
          <>
            Saves a copy of <b>{ctx.company.tradeName || ctx.company.legalName}</b>&apos;s data — parties, products, invoices, notes, purchases and
            payments — to <b>your own</b> Google Drive twice a day. Backups older than 30 days are deleted automatically. (The platform also keeps
            its own backups.)
          </>
        }
      />
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-semibold">Download a copy now</h2>
          <p className="text-xs text-muted">All of this company&apos;s data as a JSON file, saved to this computer.</p>
        </div>
        <a href={`/c/${ctx.companyId}/settings/export`} className="text-sm font-medium text-primary hover:underline">
          Export all data
        </a>
      </Card>
    </div>
  );
}
