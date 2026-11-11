/**
 * Optional built-in backup scheduler (opt-in: BACKUP_INTERNAL_SCHEDULER="true").
 * Every 15 minutes it calls this app's own /api/cron/backup endpoint; the endpoint only backs up
 * targets not backed up in the last ~11 hours, so the effective schedule is twice a day.
 *
 * On Hostinger leave it off and use a Cron Job instead: background timers stop on restarts and the
 * app may not be able to reach itself over the loopback address.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.BACKUP_INTERNAL_SCHEDULER !== "true" || process.env.NODE_ENV === "test") return;

  const g = globalThis as unknown as { __mygstBackupScheduler?: boolean };
  if (g.__mygstBackupScheduler) return;
  g.__mygstBackupScheduler = true;

  // Per-process token accepted by /api/cron/backup (never leaves this process).
  // Web Crypto (not node:crypto) so this file also compiles for the Edge bundle.
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  process.env.MYGST_INTERNAL_CRON_TOKEN = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  const port = process.env.PORT || "3000";
  let failures = 0;

  const tick = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/cron/backup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.MYGST_INTERNAL_CRON_TOKEN}` },
      });
      failures = 0;
      const body = (await res.json().catch(() => null)) as { ran?: number; failed?: number } | null;
      if (body?.ran) console.info(`[backup-scheduler] ran ${body.ran} backup(s), ${body.failed ?? 0} failed`);
    } catch (err) {
      failures++;
      if (failures >= 3) {
        clearInterval(timer);
        console.warn(
          "[backup-scheduler] can't reach this app on the loopback address; built-in scheduler disabled. " +
            "Use a cron job calling /api/cron/backup instead (set BACKUP_INTERNAL_SCHEDULER=false).",
        );
      } else if (failures === 1) {
        console.warn("[backup-scheduler] tick failed:", err instanceof Error ? err.message : err);
      }
    }
  };
  setTimeout(tick, 2 * 60_000); // first check shortly after start
  const timer = setInterval(tick, 15 * 60_000);
  timer.unref?.();
}
