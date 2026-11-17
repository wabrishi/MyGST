import "server-only";
import { decryptSecret } from "../backup/crypto";
import { db } from "../db";
import { signPayload } from "../events/signing";
import { isPluginActive } from "./access";
import { recordFailure, recordSuccess, withTimeout } from "./log";
import type { PluginEvent } from "./manifest";
import { safeFetch } from "./net";
import { ACTION_TIMEOUT_MS, contextFor, manifestOf, type PluginEntry } from "./runner";
import type { PluginEventEnvelope } from "./sdk";

export type DeliveryResult = { ok: true } | { ok: false; error: string; dead?: boolean };

/** Delivers one plugin outbox row. Called by the outbox dispatcher (src/lib/events/outbox.ts). */
export async function deliverPluginEvent(row: { id: string; companyId: string; pluginId: string; envelope: unknown }): Promise<DeliveryResult> {
  const plugin = await db.plugin.findUnique({ where: { id: row.pluginId }, include: { companies: { where: { companyId: row.companyId } } } });
  if (!plugin) return { ok: false, error: "Plugin uninstalled", dead: true };
  const cp = plugin.companies[0] ?? null;
  if (!isPluginActive(plugin, cp)) return { ok: false, error: "Plugin is not active for this company", dead: true };
  const manifest = manifestOf(plugin);
  if (!manifest) return { ok: false, error: "Plugin code or manifest is missing", dead: true };
  const env = row.envelope as PluginEventEnvelope;

  let result: DeliveryResult;
  if (plugin.kind !== "EXTERNAL") {
    const { codeFor } = await import("./uploaded");
    const code = await codeFor(plugin);
    const handlers = code?.actions.get(env.type as PluginEvent) ?? [];
    const entry: PluginEntry = { plugin, cp, manifest, code, available: true, active: true };
    result = { ok: true };
    if (handlers.length) {
      const ctx = await contextFor(entry, row.companyId);
      for (const { handler } of handlers) {
        try {
          await withTimeout(handler(env, ctx), ACTION_TIMEOUT_MS, `${env.type} handler`);
        } catch (e) {
          result = { ok: false, error: e instanceof Error ? e.message : String(e) };
          break;
        }
      }
    }
  } else {
    result = await postSigned(manifest.webhookUrl, cp?.webhookSecretEnc ?? null, row.id, JSON.stringify(row.envelope));
  }

  if (result.ok) await recordSuccess(plugin.id, row.companyId);
  else if (!result.dead) await recordFailure(plugin.id, row.companyId, `${env.type} event`, new Error(result.error));
  return result;
}

/** Signed POST to an external plugin (same scheme as Lead Manager webhooks, with X-MyGST-* headers). */
export async function postSigned(url: string | undefined, secretEnc: string | null, eventId: string, body: string): Promise<DeliveryResult> {
  if (!url) return { ok: false, error: "Plugin has no webhookUrl", dead: true };
  if (!secretEnc) return { ok: false, error: "No webhook secret for this company (re-enable the plugin)", dead: true };
  const ts = Math.floor(Date.now() / 1000);
  try {
    const res = await safeFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MyGST-Plugins/1",
        "X-MyGST-Event-Id": eventId,
        "X-MyGST-Timestamp": String(ts),
        "X-MyGST-Signature": signPayload(decryptSecret(secretEnc), ts, body),
      },
      body,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
