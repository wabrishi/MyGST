import { readdirSync } from "node:fs";
import { join } from "node:path";
import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { isSuperAdmin, requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { verificationRequired } from "@/lib/email-verification";
import { mailEnabled } from "@/lib/mail";
import { autoMigrateEnabled, lastMigrationRun } from "@/lib/migrate";
import { ApplyMigrationsButton, RetryEventsButton } from "./system-client";

export const metadata = { title: "System" };

const when = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "never");
const ago = (d: Date | string | null | undefined) => {
  if (!d) return Infinity;
  return (Date.now() - new Date(d).getTime()) / 60_000;
};

/** Migration folders shipped with this build (Hostinger keeps prisma/ next to the app for migrate deploy). */
function bundledMigrations(): string[] | null {
  try {
    return readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return null;
  }
}

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-label="OK" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-label="Problem" />}
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </li>
  );
}

/** Everything the page shows, loaded in parallel. */
async function loadSystem() {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const [outbox, dead, targets, pluginErrors, paused, cron, applied, version] = await Promise.all([
    db.outboxEvent.groupBy({ by: ["status"], _count: true }),
    db.outboxEvent.findMany({ where: { status: "DEAD" }, orderBy: { createdAt: "desc" }, take: 10, include: { company: { select: { legalName: true, tradeName: true } } } }),
    db.backupTarget.findMany({
      orderBy: [{ scope: "asc" }, { lastSuccessAt: "asc" }],
      take: 30,
      include: { company: { select: { id: true, legalName: true, tradeName: true } }, runs: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, error: true, startedAt: true } } },
    }),
    db.pluginLog.findMany({ where: { level: "error", createdAt: { gte: since24h } }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.companyPlugin.count({ where: { pausedReason: { not: null } } }),
    db.systemState.findUnique({ where: { key: "cron.lastTick" } }),
    db.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
      SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`.catch(() => null),
    db.$queryRaw<Array<{ v: string }>>`SELECT VERSION() AS v`.then((r) => r[0]?.v ?? "?").catch(() => "?"),
  ]);
  return { outbox, dead, targets, pluginErrors, paused, cron, applied, version };
}

export default async function AdminSystemPage() {
  const admin = await requireAdmin("system.view");
  const startup = lastMigrationRun();
  const { outbox, dead, targets, pluginErrors, paused, cron, applied, version } = await loadSystem();
  const count = (s: string) => outbox.find((o) => o.status === s)?._count ?? 0;
  const cronAt = (cron?.value as { at?: string } | null)?.at;
  const bundled = bundledMigrations();
  const done = new Set((applied ?? []).filter((m) => m.finished_at && !m.rolled_back_at).map((m) => m.migration_name));
  const pending = bundled?.filter((m) => !done.has(m)) ?? [];
  const failedMig = (applied ?? []).filter((m) => !m.finished_at && !m.rolled_back_at);

  const checks = [
    { ok: !!process.env.CRON_SECRET, label: "CRON_SECRET", hint: "Needed by the Hostinger Cron Job that calls /api/cron/tick." },
    { ok: ago(cronAt) < 15, label: "Cron is running", hint: `Last tick: ${when(cronAt)} (expected every minute).` },
    { ok: mailEnabled(), label: "Email (SMTP)", hint: "Invitations and password resets are emailed only when SMTP_HOST is set." },
    {
      ok: verificationRequired(),
      label: "Email verification for new accounts",
      hint: verificationRequired()
        ? "On: new users must click the emailed link before signing in."
        : "Off: turns on automatically when SMTP is set (or force it with EMAIL_VERIFICATION=on).",
    },
    {
      ok: !!process.env.BETTER_AUTH_URL && (process.env.NODE_ENV !== "production" || !/localhost/.test(process.env.BETTER_AUTH_URL)),
      label: "BETTER_AUTH_URL",
      hint: process.env.BETTER_AUTH_URL ? `${process.env.BETTER_AUTH_URL} (must be the public site address in production)` : "not set",
    },
    { ok: process.env.BACKUP_INTERNAL_SCHEDULER !== "true" || process.env.NODE_ENV !== "production", label: "Internal backup scheduler off", hint: "Keep BACKUP_INTERNAL_SCHEDULER=false on Hostinger and use the Cron Job." },
    { ok: !!applied && !pending.length && !failedMig.length, label: "Database migrations", hint: applied ? `${done.size} applied${pending.length ? `, ${pending.length} pending` : ""}${failedMig.length ? `, ${failedMig.length} failed` : ""}` : "_prisma_migrations table missing" },
  ];

  return (
    <>
      <PageHeader title="System" subtitle={`Health of background work, backups, plugins and the database · ${version}`} />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader
              title="Event delivery"
              description="Webhooks to Lead Manager and plugin events (outbox)"
              actions={<RetryEventsButton disabled={count("DEAD") === 0} />}
            />
            <div className="grid grid-cols-2 gap-px border-y border-border bg-border sm:grid-cols-4">
              {(["PENDING", "SENDING", "SENT", "DEAD"] as const).map((s) => (
                <div key={s} className="bg-surface px-5 py-3">
                  <div className="text-xs text-muted">{s === "DEAD" ? "Failed" : s[0] + s.slice(1).toLowerCase()}</div>
                  <div className={`tabular text-lg font-semibold ${s === "DEAD" && count(s) ? "text-danger" : ""}`}>{count(s)}</div>
                </div>
              ))}
            </div>
            {dead.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>Failed event</Th>
                    <Th>Company</Th>
                    <Th>Error</Th>
                  </tr>
                </thead>
                <tbody>
                  {dead.map((e) => (
                    <tr key={e.id}>
                      <Td className="text-xs">
                        <span className="font-mono">{e.type}</span>
                        {e.pluginId && <span className="text-muted"> → {e.pluginId}</span>}
                        <div className="text-muted">{when(e.createdAt)}</div>
                      </Td>
                      <Td className="text-xs">{e.company.tradeName || e.company.legalName}</Td>
                      <Td className="max-w-72 truncate text-xs text-danger">{e.lastError ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Backups" description="Each destination's last run" actions={<Link href="/admin/backups" className="text-[13px] font-medium text-primary hover:underline">Platform backups</Link>} />
            <Table>
              <thead>
                <tr>
                  <Th>Destination</Th>
                  <Th>Last success</Th>
                  <Th>Last run</Th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => {
                  const run = t.runs[0];
                  return (
                    <tr key={t.id}>
                      <Td className="text-xs">
                        {t.scope === "PLATFORM" ? "Platform" : t.company?.tradeName || t.company?.legalName}
                        <div className="text-muted">
                          {t.accountEmail}
                          {!t.enabled && " · off"}
                        </div>
                      </Td>
                      <Td className="text-xs">{when(t.lastSuccessAt)}</Td>
                      <Td className="text-xs">
                        {run ? (
                          <>
                            <Badge color={run.status === "SUCCESS" ? "green" : run.status === "FAILED" ? "red" : "amber"}>{run.status.toLowerCase()}</Badge>
                            {run.error && <div className="mt-1 max-w-72 truncate text-danger">{run.error}</div>}
                          </>
                        ) : (
                          <span className="text-muted">no runs</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
                {targets.length === 0 && (
                  <tr>
                    <Td colSpan={3} className="text-muted">
                      No backup destinations connected.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Plugin errors" description={`Last 24 hours · ${paused} paused for a company`} />
            {pluginErrors.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No plugin errors in the last 24 hours.</p>
            ) : (
              <ul className="divide-y divide-border text-xs">
                {pluginErrors.map((l) => (
                  <li key={l.id} className="px-5 py-2">
                    <Link href={`/admin/plugins/${l.pluginId}`} className="font-medium hover:text-primary">
                      {l.pluginId}
                    </Link>{" "}
                    <span className="text-muted">{when(l.createdAt)}</span>
                    <div className="text-danger">{l.message}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4 text-sm">
            <h2 className="mb-3 font-semibold">Checks</h2>
            <ul className="flex flex-col gap-3">
              {checks.map((c) => (
                <Check key={c.label} {...c} />
              ))}
            </ul>
          </Card>
          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Migrations</h2>
            <p className="mb-2 text-xs text-muted">
              {autoMigrateEnabled() ? "Applied automatically when the app starts." : "Automatic migration is off (AUTO_MIGRATE=false)."}
              {startup && ` Last start: ${when(startup.at)}${startup.applied.length ? `, applied ${startup.applied.length}` : ""}.`}
            </p>
            {startup?.error && <p className="mb-2 break-words text-xs text-danger">At start: {startup.error}</p>}
            {(pending.length > 0 || failedMig.length > 0) && (
              <div className="mb-3 flex flex-col gap-2">
                {pending.length > 0 && <p className="text-xs text-danger">Pending: {pending.join(", ")}.</p>}
                {isSuperAdmin(admin) ? (
                  <ApplyMigrationsButton />
                ) : (
                  <p className="text-xs text-muted">A super admin can apply them here, or restart the app.</p>
                )}
              </div>
            )}
            <ul className="max-h-72 overflow-auto font-mono text-[11px]">
              {(applied ?? []).map((m) => (
                <li key={m.migration_name} className={m.finished_at ? "text-muted" : "text-danger"}>
                  {m.finished_at ? "✓" : "✗"} {m.migration_name}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
