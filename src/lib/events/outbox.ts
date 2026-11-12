import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { decryptSecret } from "../backup/crypto";
import { db, type Tx } from "../db";
import { newEventId, nextAttempt, signPayload } from "./signing";

export { BACKOFF_MS, newEventId, nextAttempt, signPayload, validateWebhookUrl } from "./signing";

/**
 * Suite events (ARCHITECTURE.md §5): transactional outbox + signed point-to-point delivery to the
 * company's Lead Manager webhook. Events are only recorded when an enabled webhook is configured.
 */

export type EventType = "quotation.created" | "quotation.converted" | "invoice.issued" | "invoice.cancelled" | "payment.received";

export interface EventData {
  id: string;
  number: string;
  total: number;
  amount: number;
  status: string;
  url: string;
  leadRef?: string;
  partyId: string;
  [extra: string]: unknown;
}

const appUrl = () => (process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
export const absoluteUrl = (path: string) => `${appUrl()}${path}`;

/** Records an event inside the caller's transaction (no-op when no webhook is configured). */
export async function enqueueEvent(tx: Tx, companyId: string, type: EventType, data: EventData) {
  const integration = await tx.companyIntegration.findUnique({ where: { companyId }, select: { enabled: true, leadsWebhookUrl: true } });
  if (!integration?.enabled || !integration.leadsWebhookUrl) return;
  const id = newEventId();
  const envelope = { id, type, source: "gst", workspaceId: companyId, occurredAt: new Date().toISOString(), data: stripUndefined(data) };
  await tx.outboxEvent.create({ data: { id, companyId, type, envelope: envelope as Prisma.InputJsonValue } });
}

const stripUndefined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/**
 * Delivers due events (optionally for one company). Each event is claimed with a conditional update so
 * concurrent dispatchers never send the same event twice at the same time; receivers dedupe by id anyway.
 */
export async function deliverPending(opts: { companyId?: string; limit?: number } = {}) {
  const now = new Date();
  // Release events stuck in SENDING (process died mid-delivery) after 5 minutes.
  await db.outboxEvent.updateMany({
    where: { status: "SENDING", nextAttemptAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
    data: { status: "PENDING" },
  });
  const due = await db.outboxEvent.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now }, ...(opts.companyId && { companyId: opts.companyId }) },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 50,
    select: { id: true, companyId: true },
  });
  const results = { sent: 0, failed: 0, dead: 0 };
  const integrations = new Map<string, { url: string; secret: string; enabled: boolean } | null>();

  for (const ev of due) {
    const claimed = await db.outboxEvent.updateMany({ where: { id: ev.id, status: "PENDING" }, data: { status: "SENDING", nextAttemptAt: new Date() } });
    if (claimed.count !== 1) continue;
    const row = await db.outboxEvent.findUniqueOrThrow({ where: { id: ev.id } });

    if (!integrations.has(ev.companyId)) {
      const i = await db.companyIntegration.findUnique({ where: { companyId: ev.companyId } });
      integrations.set(ev.companyId, i ? { url: i.leadsWebhookUrl, secret: decryptSecret(i.webhookSecretEnc), enabled: i.enabled } : null);
    }
    const target = integrations.get(ev.companyId);
    if (!target?.enabled || !target.url) {
      await db.outboxEvent.update({ where: { id: row.id }, data: { status: "DEAD", lastError: "Webhook disabled or removed" } });
      results.dead++;
      continue;
    }

    const body = JSON.stringify(row.envelope);
    const ts = Math.floor(Date.now() / 1000);
    let error: string | null = null;
    try {
      const res = await fetch(target.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "MyGST-Webhooks/1",
          "X-Suite-Event-Id": row.id,
          "X-Suite-Timestamp": String(ts),
          "X-Suite-Signature": signPayload(target.secret, ts, body),
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) error = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    if (!error) {
      await db.outboxEvent.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date(), attempts: row.attempts + 1, lastError: null } });
      results.sent++;
    } else {
      const attempts = row.attempts + 1;
      const next = nextAttempt(attempts);
      await db.outboxEvent.update({
        where: { id: row.id },
        data: next ? { status: "PENDING", attempts, nextAttemptAt: next, lastError: error } : { status: "DEAD", attempts, lastError: error },
      });
      if (next) results.failed++;
      else results.dead++;
    }
  }
  return { due: due.length, ...results };
}

/** Try to deliver right after the current request finishes (cron is the safety net). */
export async function deliverSoon(companyId: string) {
  try {
    const { after } = await import("next/server");
    after(() => deliverPending({ companyId, limit: 20 }).catch((e) => console.error("[events] immediate delivery failed:", e)));
  } catch {
    // Outside a request (tests, scripts): leave it to the cron dispatcher.
  }
}
