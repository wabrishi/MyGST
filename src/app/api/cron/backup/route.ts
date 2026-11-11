import { timingSafeEqual } from "node:crypto";
import { runDueBackups } from "@/lib/backup/runner";

/**
 * Scheduled backups. Call twice a day from Hostinger hPanel → Advanced → Cron Jobs, e.g.
 *   0 2,14 * * *   curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://your-domain/api/cron/backup
 * Only targets whose last success is older than ~11 h are run, so extra calls are harmless.
 * Add ?force=1 to back up every enabled target now.
 */
const same = (given: string, secret: string | undefined) => {
  if (!secret) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** null = no secret configured at all; true/false = valid or not. */
function authorized(request: Request) {
  const cron = process.env.CRON_SECRET;
  const internal = process.env.MYGST_INTERNAL_CRON_TOKEN; // set by the built-in scheduler (instrumentation.ts)
  if (!cron && !internal) return null;
  const url = new URL(request.url);
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("key") ?? "";
  return same(given, cron) || same(given, internal);
}

async function handle(request: Request) {
  const ok = authorized(request);
  if (ok === null) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const force = new URL(request.url).searchParams.get("force") === "1";
  const started = Date.now();
  const results = await runDueBackups({ force });
  const failed = results.filter((r) => r.status === "FAILED").length;
  return Response.json({ ran: results.length, failed, ms: Date.now() - started, results }, { status: failed ? 207 : 200 });
}

export const GET = handle;
export const POST = handle;
