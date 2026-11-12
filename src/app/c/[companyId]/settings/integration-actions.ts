"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { generateApiKey } from "@/lib/api/keys";
import { audit } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/backup/crypto";
import { db } from "@/lib/db";
import { deliverPending, newEventId, signPayload, validateWebhookUrl } from "@/lib/events/outbox";
import { requireCompany } from "@/lib/tenant";

// ───────────────────────── API keys (owner only) ─────────────────────────

export async function createApiKey(companyId: string, name: string): Promise<ActionResult<{ key: string; prefix: string }>> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    const label = z.string().trim().min(1, "Give the key a name, e.g. “Lead Manager”").max(60).parse(name);
    if ((await db.apiKey.count({ where: { companyId: ctx.companyId, revokedAt: null } })) >= 20) throw new UserError("Revoke an unused key first (limit 20)");
    const { key, hash, prefix } = generateApiKey();
    const row = await db.apiKey.create({ data: { companyId: ctx.companyId, name: label, prefix, keyHash: hash, createdById: ctx.user.id } });
    await audit(ctx, "create", "api_key", row.id, { name: label, prefix });
    revalidatePath(`/c/${ctx.companyId}/settings/api-keys`);
    return ok({ key, prefix });
  });
}

export async function revokeApiKey(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    const r = await db.apiKey.updateMany({ where: { id, companyId: ctx.companyId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (r.count !== 1) throw new UserError("Key not found or already revoked");
    await audit(ctx, "revoke", "api_key", id);
    revalidatePath(`/c/${ctx.companyId}/settings/api-keys`);
    return ok(undefined, "Key revoked");
  });
}

// ───────────────────────── Lead Manager webhook ─────────────────────────

const newSecret = () => "whsec_" + randomBytes(24).toString("base64url");

export async function saveLeadsWebhook(companyId: string, input: { url: string; enabled: boolean }): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    const url = input.url.trim();
    if (url) {
      const problem = validateWebhookUrl(url);
      if (problem) throw new UserError(problem, "url");
    }
    const existing = await db.companyIntegration.findUnique({ where: { companyId: ctx.companyId } });
    await db.companyIntegration.upsert({
      where: { companyId: ctx.companyId },
      create: { companyId: ctx.companyId, leadsWebhookUrl: url, enabled: input.enabled, webhookSecretEnc: encryptSecret(newSecret()) },
      update: { leadsWebhookUrl: url, enabled: input.enabled },
    });
    await audit(ctx, existing ? "update" : "create", "integration", "leads_webhook", { enabled: input.enabled, host: url ? new URL(url).host : "" });
    revalidatePath(`/c/${ctx.companyId}/settings/integrations`);
    return ok(undefined, url ? "Webhook saved" : "Webhook removed");
  });
}

export async function regenerateWebhookSecret(companyId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    const r = await db.companyIntegration.updateMany({ where: { companyId: ctx.companyId }, data: { webhookSecretEnc: encryptSecret(newSecret()) } });
    if (r.count !== 1) throw new UserError("Save a webhook URL first");
    await audit(ctx, "rotate_secret", "integration", "leads_webhook");
    revalidatePath(`/c/${ctx.companyId}/settings/integrations`);
    return ok(undefined, "New signing secret generated — update it in Lead Manager");
  });
}

/** Sends a signed `test.ping` straight away (not via the outbox) and reports what the receiver said. */
export async function sendTestEvent(companyId: string): Promise<ActionResult<{ status: number }>> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    const i = await db.companyIntegration.findUnique({ where: { companyId: ctx.companyId } });
    if (!i?.leadsWebhookUrl) throw new UserError("Save a webhook URL first");
    const id = newEventId();
    const body = JSON.stringify({ id, type: "test.ping", source: "gst", workspaceId: ctx.companyId, occurredAt: new Date().toISOString(), data: { message: "Test event from MyGST" } });
    const ts = Math.floor(Date.now() / 1000);
    let res: Response;
    try {
      res = await fetch(i.leadsWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "MyGST-Webhooks/1",
          "X-Suite-Event-Id": id,
          "X-Suite-Timestamp": String(ts),
          "X-Suite-Signature": signPayload(decryptSecret(i.webhookSecretEnc), ts, body),
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      throw new UserError(`Couldn't reach the webhook: ${(e as Error).message}`);
    }
    if (!res.ok) throw new UserError(`Webhook answered HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return ok({ status: res.status }, `Delivered — webhook answered HTTP ${res.status}`);
  });
}

/** Re-queues failed (dead) events and tries to deliver them now. */
export async function retryFailedEvents(companyId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    const r = await db.outboxEvent.updateMany({ where: { companyId: ctx.companyId, status: "DEAD" }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date() } });
    const sent = await deliverPending({ companyId: ctx.companyId, limit: 50 });
    revalidatePath(`/c/${ctx.companyId}/settings/integrations`);
    return ok(undefined, `${r.count} re-queued · ${sent.sent} delivered`);
  });
}

/** Reveals the signing secret to an owner (shown on demand, not in the page HTML). */
export async function revealWebhookSecret(companyId: string): Promise<ActionResult<{ secret: string }>> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    const i = await db.companyIntegration.findUnique({ where: { companyId: ctx.companyId } });
    if (!i) throw new UserError("Save a webhook URL first");
    return ok({ secret: decryptSecret(i.webhookSecretEnc) });
  });
}
