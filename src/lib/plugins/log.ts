import "server-only";
import { db } from "../db";

/** Consecutive failures after which a plugin is paused for a company (owner re-enables it). */
export const PAUSE_AFTER_FAILURES = 20;

const clip = (s: string) => s.replace(/\s+/g, " ").slice(0, 500);

/** Writes a plugin log line. Never throws (logging must not break the caller). */
export async function pluginLog(pluginId: string, companyId: string | null, level: "info" | "warn" | "error", message: string) {
  try {
    await db.pluginLog.create({ data: { pluginId, companyId, level, message: clip(message) } });
  } catch (e) {
    console.error(`[plugins] log write failed for ${pluginId}:`, (e as Error).message);
  }
  if (level === "error") console.error(`[plugin:${pluginId}]${companyId ? ` [${companyId}]` : ""} ${message}`);
}

/** Records a hook failure; pauses the plugin for the company after PAUSE_AFTER_FAILURES in a row. */
export async function recordFailure(pluginId: string, companyId: string, where: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  await pluginLog(pluginId, companyId, "error", `${where}: ${message}`);
  try {
    const cp = await db.companyPlugin.upsert({
      where: { companyId_pluginId: { companyId, pluginId } },
      create: { companyId, pluginId, failureCount: 1 },
      update: { failureCount: { increment: 1 } },
    });
    if (cp.failureCount >= PAUSE_AFTER_FAILURES && !cp.pausedReason) {
      await db.companyPlugin.update({ where: { id: cp.id }, data: { pausedReason: clip(`Paused after ${cp.failureCount} errors in a row. Last: ${message}`).slice(0, 300) } });
      await pluginLog(pluginId, companyId, "warn", `Paused after ${cp.failureCount} consecutive errors`);
    }
  } catch {
    // ignore
  }
}

/** Error lines for a company's plugins in the last `days` days (settings page). */
export const recentPluginErrors = (companyId: string, days = 7) =>
  db.pluginLog.findMany({ where: { companyId, level: "error", createdAt: { gte: new Date(Date.now() - days * 864e5) } }, orderBy: { createdAt: "desc" }, take: 100 });

/** Resets the failure streak after a success (only writes when there was a streak). */
export async function recordSuccess(pluginId: string, companyId: string) {
  await db.companyPlugin.updateMany({ where: { companyId, pluginId, failureCount: { gt: 0 } }, data: { failureCount: 0 } }).catch(() => {});
}

export function withTimeout<T>(p: Promise<T> | T, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
