import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { deliverPending } from "@/lib/events/outbox";

/**
 * Event dispatcher (ARCHITECTURE.md §5). Call every minute from a Hostinger Cron Job:
 *   * * * * *  curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://your-domain/api/cron/tick
 * Events are also delivered right after the request that created them; this is the retry safety net.
 */
const same = (a: string, b: string | undefined) => !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function handle(request: Request) {
  if (!process.env.CRON_SECRET && !process.env.MYGST_INTERNAL_CRON_TOKEN) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? new URL(request.url).searchParams.get("key") ?? "";
  if (!same(given, process.env.CRON_SECRET) && !same(given, process.env.MYGST_INTERNAL_CRON_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const events = await deliverPending({ limit: 100 });
  // Housekeeping (cheap, indexed): plugin logs older than 30 days.
  const pruned = await db.pluginLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 864e5) } } }).catch(() => ({ count: 0 }));
  // Shown on Admin → System ("cron last ran").
  await db.systemState
    .upsert({ where: { key: "cron.lastTick" }, create: { key: "cron.lastTick", value: { at: new Date().toISOString(), events } }, update: { value: { at: new Date().toISOString(), events } } })
    .catch(() => {});
  return Response.json({ events, pluginLogsPruned: pruned.count });
}

export const GET = handle;
export const POST = handle;
