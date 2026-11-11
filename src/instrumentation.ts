/**
 * Built-in backup scheduler (fallback for when no external cron is configured).
 * Every 15 minutes it calls this app's own /api/cron/backup endpoint; the endpoint only backs up
 * targets not backed up in the last ~11 hours, so the effective schedule is twice a day.
 * Disable with BACKUP_INTERNAL_SCHEDULER=false (e.g. when using Hostinger Cron Jobs only).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.BACKUP_INTERNAL_SCHEDULER === "false" || process.env.NODE_ENV === "test") return;

  const g = globalThis as unknown as { __mygstBackupScheduler?: boolean };
  if (g.__mygstBackupScheduler) return;
  g.__mygstBackupScheduler = true;

  // Per-process token accepted by /api/cron/backup (never leaves this process).
  // Web Crypto (not node:crypto) so this file also compiles for the Edge bundle.
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  process.env.MYGST_INTERNAL_CRON_TOKEN = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  const port = process.env.PORT || "3000";
  const tick = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/cron/backup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.MYGST_INTERNAL_CRON_TOKEN}` },
      });
      const body = (await res.json().catch(() => null)) as { ran?: number; failed?: number } | null;
      if (body?.ran) console.info(`[backup-scheduler] ran ${body.ran} backup(s), ${body.failed ?? 0} failed`);
    } catch (err) {
      console.warn("[backup-scheduler] tick failed:", err instanceof Error ? err.message : err);
    }
  };
  setTimeout(tick, 2 * 60_000); // first check shortly after start
  setInterval(tick, 15 * 60_000).unref?.();
}
