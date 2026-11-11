import "server-only";
import { db } from "@/lib/db";
import { googleConfigured } from "@/lib/backup/google-drive";
import { BACKUP_INTERVAL_HOURS } from "@/lib/backup/runner";
import { BackupControls } from "./backup-controls";
import { Alert, Badge, ButtonLink, Card, Table, Td, Th } from "./ui";

const fmt = (d: Date | null | undefined) =>
  d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const size = (n: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

const NOTICES: Record<string, ["success" | "error" | "warning", string]> = {
  connected: ["success", "Google Drive connected. The first backup will run within the next scheduled window — or click “Back up now”."],
  "not-configured": ["warning", "Google Drive isn't configured on this server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)."],
};

/** Backup status + controls, shared by the super-admin (platform) and company owner (company) pages. */
export async function BackupPanel({
  scope,
  companyId,
  description,
  sp,
}: {
  scope: "platform" | "company";
  companyId?: string;
  description: React.ReactNode;
  sp: Record<string, string | string[] | undefined>;
}) {
  const scopeKey = scope === "platform" ? "platform" : `company:${companyId}`;
  const target = await db.backupTarget.findUnique({
    where: { scopeKey },
    include: { runs: { orderBy: { startedAt: "desc" }, take: 15 } },
  });
  const configured = googleConfigured();
  const connectHref = `/api/backup/google/connect?scope=${scope}${companyId ? `&companyId=${companyId}` : ""}`;
  const notice = typeof sp.backup === "string" ? (sp.backup === "error" ? (["error", `Couldn't connect: ${sp.msg ?? "unknown error"}`] as const) : NOTICES[sp.backup]) : null;
  const lastRun = target?.runs[0];
  const nextDue = target?.lastSuccessAt ? new Date(target.lastSuccessAt.getTime() + BACKUP_INTERVAL_HOURS * 3_600_000) : null;

  return (
    <div className="flex flex-col gap-4">
      {notice && <Alert kind={notice[0]}>{notice[1]}</Alert>}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="font-semibold">Automatic backup to Google Drive</h2>
            <div className="mt-1 text-xs text-muted">{description}</div>
          </div>
          {target ? (
            target.enabled ? (
              <Badge color="green">On · twice daily</Badge>
            ) : (
              <Badge color="amber">Paused</Badge>
            )
          ) : (
            <Badge>Not connected</Badge>
          )}
        </div>

        {!target ? (
          <div className="mt-4 flex flex-col items-start gap-2">
            {!configured && <Alert kind="warning">The server administrator must set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before Drive can be connected.</Alert>}
            <ButtonLink href={connectHref} prefetch={false} className={configured ? "" : "pointer-events-none opacity-50"}>
              Connect Google Drive
            </ButtonLink>
            <p className="text-xs text-muted">
              MyGST asks only for access to files it creates (it can&apos;t see the rest of your Drive). Backups go into a “MyGST Backups” folder
              and are kept for 30 days.
            </p>
          </div>
        ) : (
          <>
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Google account</dt>
                <dd>{target.accountEmail}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Drive folder</dt>
                <dd>
                  <a className="text-primary hover:underline" href={`https://drive.google.com/drive/folders/${target.folderId}`} target="_blank" rel="noreferrer">
                    Open in Google Drive ↗
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Last successful backup</dt>
                <dd>{fmt(target.lastSuccessAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Next automatic backup</dt>
                <dd>{target.enabled ? (nextDue ? `after ${fmt(nextDue)}` : "at the next scheduled run") : "paused"}</dd>
              </div>
            </dl>
            {lastRun?.status === "FAILED" && (
              <div className="mt-3">
                <Alert>Last backup failed: {lastRun.error}</Alert>
              </div>
            )}
            <div className="mt-4">
              <BackupControls scope={scope} companyId={companyId ?? null} enabled={target.enabled} connectHref={connectHref} />
            </div>
          </>
        )}
      </Card>

      {target && target.runs.length > 0 && (
        <Card>
          <h3 className="p-3 font-semibold">Recent backups</h3>
          <Table>
            <thead>
              <tr>
                <Th>Started</Th>
                <Th>Trigger</Th>
                <Th>Status</Th>
                <Th>File</Th>
                <Th className="text-right">Size</Th>
              </tr>
            </thead>
            <tbody>
              {target.runs.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{fmt(r.startedAt)}</Td>
                  <Td>{r.trigger === "MANUAL" ? "Manual" : "Scheduled"}</Td>
                  <Td>
                    {r.status === "SUCCESS" ? <Badge color="green">Success</Badge> : r.status === "FAILED" ? <Badge color="red">Failed</Badge> : <Badge color="blue">Running</Badge>}
                  </Td>
                  <Td className="max-w-80 truncate text-xs" title={r.error ?? r.fileName ?? ""}>
                    {r.fileName ?? <span className="text-danger">{r.error}</span>}
                    {r.deleted > 0 && <span className="text-muted"> · {r.deleted} old removed</span>}
                  </Td>
                  <Td className="text-right text-xs">{size(r.sizeBytes)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
