import "server-only";
import { db } from "../db";
import { decryptSecret } from "./crypto";
import { companyBackupFile, platformBackupFile } from "./export";
import { googleDrive, type DriveApi } from "./google-drive";

/** Twice daily: a target is "due" when its last success is older than this. */
export const BACKUP_INTERVAL_HOURS = 11;
/** A run stuck longer than this (crashed process) no longer blocks new runs. */
const STALE_RUN_MINUTES = 30;
/** After a failed run, wait this long before the scheduler retries. */
const RETRY_AFTER_FAILURE_MINUTES = 60;

const stamp = (d = new Date()) => d.toISOString().replace(/[:]/g, "").replace(/\.\d+Z$/, "Z"); // 2026-11-11T020000Z
const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "company";

export interface RunResult {
  targetId: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  fileName?: string;
  sizeBytes?: number;
  deleted?: number;
  error?: string;
}

/**
 * Runs one backup: build file → upload to Drive → apply retention. Overlapping runs for the same
 * target are prevented with a conditional "lock" update on `runningSince`.
 */
export async function runBackup(targetId: string, trigger: "SCHEDULED" | "MANUAL", drive: DriveApi = googleDrive): Promise<RunResult> {
  const staleBefore = new Date(Date.now() - STALE_RUN_MINUTES * 60_000);
  const locked = await db.backupTarget.updateMany({
    where: { id: targetId, OR: [{ runningSince: null }, { runningSince: { lt: staleBefore } }] },
    data: { runningSince: new Date() },
  });
  if (locked.count !== 1) return { targetId, status: "SKIPPED", error: "A backup is already running" };

  const run = await db.backupRun.create({ data: { targetId, trigger, status: "RUNNING" } });
  try {
    const target = await db.backupTarget.findUniqueOrThrow({ where: { id: targetId }, include: { company: { select: { legalName: true, tradeName: true } } } });
    const token = await drive.accessTokenFrom(decryptSecret(target.refreshTokenEnc));

    // Re-create the folder if the user deleted it from Drive.
    let folderId = target.folderId;
    if (!(await drive.folderExists(token, folderId))) {
      folderId = await drive.createFolder(token, folderName(target.scope, target.company?.tradeName || target.company?.legalName));
      await db.backupTarget.update({ where: { id: targetId }, data: { folderId } });
    }

    const { data, fileName } =
      target.scope === "PLATFORM"
        ? { data: (await platformBackupFile()).data, fileName: `mygst-platform-${stamp()}.ndjson.gz` }
        : {
            data: (await companyBackupFile(target.companyId!)).data,
            fileName: `mygst-${slug(target.company?.tradeName || target.company?.legalName || "company")}-${stamp()}.json.gz`,
          };

    const fileId = await drive.uploadFile(token, folderId, fileName, data, "application/gzip");

    // Retention: delete backups older than N days (only files in our folder; drive.file scope can't touch others).
    let deleted = 0;
    const cutoff = Date.now() - target.retentionDays * 86_400_000;
    for (const f of await drive.listFiles(token, folderId)) {
      if (f.id !== fileId && f.name.startsWith("mygst-") && Date.parse(f.createdTime) < cutoff) {
        await drive.deleteFile(token, f.id);
        deleted++;
      }
    }

    await db.backupRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", finishedAt: new Date(), fileName, fileId, sizeBytes: data.length, deleted },
    });
    await db.backupTarget.update({ where: { id: targetId }, data: { lastSuccessAt: new Date(), runningSince: null } });
    return { targetId, status: "SUCCESS", fileName, sizeBytes: data.length, deleted };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[backup] target ${targetId} failed:`, error);
    await db.backupRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: error.slice(0, 2000) } });
    await db.backupTarget.update({ where: { id: targetId }, data: { runningSince: null } });
    return { targetId, status: "FAILED", error };
  }
}

export const folderName = (scope: "PLATFORM" | "COMPANY", companyName?: string | null) =>
  scope === "PLATFORM" ? "MyGST Backups (platform)" : `MyGST Backups - ${companyName ?? "Company"}`;

/**
 * Runs every enabled target that is due (or all enabled targets with `force`). Safe to call
 * often — from the Hostinger cron job and/or the in-process scheduler.
 */
export async function runDueBackups(opts: { force?: boolean; drive?: DriveApi } = {}) {
  const dueBefore = new Date(Date.now() - BACKUP_INTERVAL_HOURS * 3_600_000);
  const targets = await db.backupTarget.findMany({
    where: {
      enabled: true,
      ...(opts.force ? {} : { OR: [{ lastSuccessAt: null }, { lastSuccessAt: { lt: dueBefore } }] }),
    },
    select: {
      id: true,
      company: { select: { suspendedAt: true } },
      runs: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, startedAt: true } },
    },
    orderBy: { scope: "asc" }, // platform first
  });
  const retryAfter = Date.now() - RETRY_AFTER_FAILURE_MINUTES * 60_000;
  const results: RunResult[] = [];
  for (const t of targets) {
    if (t.company?.suspendedAt) continue; // don't back up suspended companies to their owner's Drive
    const last = t.runs[0];
    // Back off after a failure so a broken destination isn't hammered every scheduler tick.
    if (!opts.force && last?.status === "FAILED" && last.startedAt.getTime() > retryAfter) continue;
    results.push(await runBackup(t.id, "SCHEDULED", opts.drive));
  }
  return results;
}
