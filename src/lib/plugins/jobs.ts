import "server-only";
import { db } from "../db";
import { isPluginActive } from "./access";
import { isJobDue } from "./job-schedule";
import { recordFailure, recordSuccess, withTimeout } from "./log";
import { ACTION_TIMEOUT_MS, contextFor, manifestOf, type PluginEntry } from "./runner";
import { codeFor } from "./uploaded";

/**
 * Runs due plugin jobs (manifest.jobs + api.schedule) for every company where the plugin is active.
 * Called by /api/cron/tick every minute. A run is claimed in plugin_job_run before it starts, so two
 * overlapping ticks never run the same job twice; at most `limit` runs per tick (the rest wait a minute).
 */
export async function runDueJobs({ now = new Date(), limit = 25 }: { now?: Date; limit?: number } = {}) {
  const plugins = await db.plugin.findMany({ where: { status: "INSTALLED", availability: { not: "NONE" }, kind: { not: "EXTERNAL" } }, omit: { bundle: true }, include: { companies: true } });
  const companies = await db.company.findMany({ where: { suspendedAt: null }, select: { id: true } });
  let ran = 0;
  let failed = 0;

  for (const { companies: cps, ...plugin } of plugins) {
    const manifest = manifestOf(plugin);
    if (!manifest?.jobs.length) continue;
    const code = await codeFor(plugin);
    if (!code) continue;
    const byCompany = new Map(cps.map((c) => [c.companyId, c]));
    const runs = await db.pluginJobRun.findMany({ where: { pluginId: plugin.id } });
    const lastRun = new Map(runs.map((r) => [`${r.companyId}/${r.job}`, r]));

    for (const { id: companyId } of companies) {
      const cp = byCompany.get(companyId) ?? null;
      if (!isPluginActive(plugin, cp ?? undefined)) continue;
      const entry: PluginEntry = { plugin, cp, manifest, code, available: true, active: true };
      for (const job of manifest.jobs) {
        if (ran + failed >= limit) return { ran, failed, more: true };
        const handler = code.jobs.get(job.id);
        const prev = lastRun.get(`${companyId}/${job.id}`) ?? null;
        if (!handler || !isJobDue(job.every, prev?.lastRunAt ?? null, now)) continue;
        if (!(await claim(plugin.id, companyId, job.id, prev, now))) continue;
        try {
          await withTimeout(Promise.resolve(handler(await contextFor(entry, companyId))), ACTION_TIMEOUT_MS, `job ${job.id}`);
          await db.pluginJobRun.updateMany({ where: { pluginId: plugin.id, companyId, job: job.id }, data: { lastError: null } });
          await recordSuccess(plugin.id, companyId);
          ran++;
        } catch (e) {
          failed++;
          await db.pluginJobRun.updateMany({ where: { pluginId: plugin.id, companyId, job: job.id }, data: { lastError: String((e as Error).message).slice(0, 500) } });
          await recordFailure(plugin.id, companyId, `job ${job.id}`, e);
        }
      }
    }
  }
  return { ran, failed, more: false };
}

/** Marks the job as running now; false if another tick got there first. */
async function claim(pluginId: string, companyId: string, job: string, prev: { id: string; lastRunAt: Date } | null, now: Date) {
  if (prev) return (await db.pluginJobRun.updateMany({ where: { id: prev.id, lastRunAt: prev.lastRunAt }, data: { lastRunAt: now } })).count === 1;
  try {
    await db.pluginJobRun.create({ data: { pluginId, companyId, job, lastRunAt: now } });
    return true;
  } catch {
    return false; // unique (pluginId, companyId, job): someone else created it
  }
}
