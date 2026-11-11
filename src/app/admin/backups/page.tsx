import Link from "next/link";
import { BackupPanel } from "@/components/backup-panel";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { redirectUri } from "@/lib/backup/google-drive";

export const metadata = { title: "Backups" };

export default async function AdminBackupsPage({ searchParams }: PageProps<"/admin/backups">) {
  const sp = await searchParams;
  const companyTargets = await db.backupTarget.findMany({
    where: { scope: "COMPANY" },
    orderBy: { lastSuccessAt: "asc" },
    select: {
      id: true,
      enabled: true,
      lastSuccessAt: true,
      accountEmail: true,
      company: { select: { id: true, legalName: true, tradeName: true } },
      runs: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true } },
    },
  });
  const cronSet = !!process.env.CRON_SECRET;
  const internal = process.env.BACKUP_INTERNAL_SCHEDULER === "true";

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader title="Backups" />
      <BackupPanel
        scope="platform"
        sp={sp}
        description={
          <>
            Full backup of the <b>whole platform</b> — every company, user and transaction — as a compressed file (
            <code>.ndjson.gz</code>), uploaded to your Google Drive twice a day and kept for 30 days. Contains all customers&apos; data: connect a
            Google account you control and protect.
          </>
        }
      />

      <Card className="p-5 text-sm">
        <h2 className="mb-2 font-semibold">Schedule</h2>
        <ul className="flex flex-col gap-1.5">
          <li>
            Built-in scheduler: {internal ? <Badge color="green">On</Badge> : <Badge>Off</Badge>} — optional (BACKUP_INTERNAL_SCHEDULER=&quot;true&quot;); checks
            every 15 minutes while the app runs. Leave it off on Hostinger and use the cron job below.
          </li>
          <li>
            Cron endpoint: {cronSet ? <Badge color="green">CRON_SECRET set</Badge> : <Badge color="amber">CRON_SECRET not set</Badge>} — recommended on
            Hostinger, since the app may sleep when idle. In hPanel → Advanced → Cron Jobs add (twice daily, 02:00 &amp; 14:00):
            <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs">
              {`0 2,14 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" ${process.env.APP_URL ?? "https://your-domain"}/api/cron/backup`}
            </pre>
          </li>
          <li>
            Google OAuth redirect URI to register in Google Cloud Console: <code className="break-all">{redirectUri()}</code>
          </li>
        </ul>
      </Card>

      <Card>
        <h2 className="p-3 font-semibold">Company backups ({companyTargets.length} connected by owners)</h2>
        {companyTargets.length === 0 ? (
          <p className="px-3 pb-4 text-muted">No company has connected its own Google Drive yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Company</Th>
                <Th>Google account</Th>
                <Th>Last success</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {companyTargets.map((t) => (
                <tr key={t.id}>
                  <Td>
                    {t.company ? (
                      <Link className="text-primary hover:underline" href={`/admin/companies/${t.company.id}`}>
                        {t.company.tradeName || t.company.legalName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-xs">{t.accountEmail}</Td>
                  <Td className="text-xs">{t.lastSuccessAt?.toISOString().replace("T", " ").slice(0, 16) ?? "never"}</Td>
                  <Td>
                    {!t.enabled ? <Badge>Paused</Badge> : t.runs[0]?.status === "FAILED" ? <Badge color="red">Failing</Badge> : <Badge color="green">OK</Badge>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
