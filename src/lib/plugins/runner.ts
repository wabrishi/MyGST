import "server-only";
import type { CompanyPlugin, Plugin } from "@/generated/prisma/client";
import type { BuiltinRoleKey as Role } from "@/lib/permissions";
import { UserError } from "../action";
import { decryptSecret } from "../backup/crypto";
import { db, type Tx } from "../db";
import { signPayload } from "../events/signing";
import { isAvailableTo, isPluginActive } from "./access";
import { buildPluginContext } from "./context";
import { recordFailure, recordSuccess, withTimeout } from "./log";
import { parseManifest, type PluginFilter, type PluginManifest } from "./manifest";
import { safeFetch } from "./net";
import { codePlugin, type CodePlugin } from "./registry";
import { codeFor } from "./uploaded";
import type { FilterMap, PluginContext } from "./sdk";

/** Hook execution with isolation: timeouts, error logging, auto-pause. */
export const FILTER_TIMEOUT_MS = 2_000;
export const EXTERNAL_FILTER_TIMEOUT_MS = 3_000;
export const ACTION_TIMEOUT_MS = 30_000;

/** A plugin row without the (large) uploaded bundle. */
export type PluginRow = Omit<Plugin, "bundle">;

export interface PluginEntry {
  plugin: PluginRow;
  cp: CompanyPlugin | null;
  manifest: PluginManifest;
  code: CodePlugin | null;
  available: boolean;
  active: boolean;
}

/** The manifest in effect: a built-in plugin's current one (from the build), else the stored one. */
export function manifestOf(plugin: Pick<Plugin, "id" | "kind" | "manifest">): PluginManifest | null {
  if (plugin.kind === "CODE") return codePlugin(plugin.id)?.manifest ?? null;
  try {
    return parseManifest(plugin.manifest, plugin.kind === "UPLOADED" ? "CODE" : "EXTERNAL");
  } catch {
    return null;
  }
}

/** Installed plugins with this company's state (available/active). */
export async function pluginEntries(companyId: string, tx: Tx | typeof db = db): Promise<PluginEntry[]> {
  const plugins = await tx.plugin.findMany({ where: { status: "INSTALLED" }, omit: { bundle: true }, include: { companies: { where: { companyId } } }, orderBy: { name: "asc" } });
  const out: PluginEntry[] = [];
  for (const { companies, ...plugin } of plugins) {
    const manifest = manifestOf(plugin);
    if (!manifest) continue; // code plugin removed or broken
    const cp = companies[0] ?? null;
    const code = plugin.kind === "EXTERNAL" ? null : await codeFor(plugin);
    if (plugin.kind === "UPLOADED" && !code) continue; // bundle failed to load (shown in Admin → Plugins)
    out.push({ plugin, cp, manifest, code, available: isAvailableTo(plugin, cp), active: isPluginActive(plugin, cp) });
  }
  return out;
}

export const activeEntries = async (companyId: string, tx: Tx | typeof db = db) => (await pluginEntries(companyId, tx)).filter((e) => e.active);

export function contextFor(e: PluginEntry, companyId: string, user?: { id: string; name: string; email: string } | null, role?: Role | null): Promise<PluginContext> {
  return buildPluginContext({ pluginId: e.plugin.id, manifest: e.manifest, companyId, settings: e.cp?.settings, user, role, actingUserId: e.cp?.enabledBy });
}

export interface HookScope {
  companyId: string;
  user?: { id: string; name: string; email: string } | null;
  role?: Role | null;
}

/**
 * Runs a filter through every active plugin that implements it (priority order within a plugin,
 * plugins in name order). A failing plugin is skipped (fail-open) — except a PluginError/UserError from
 * document.validate, which is the plugin deliberately blocking the save.
 */
export async function applyFilters<F extends PluginFilter>(scope: HookScope, name: F, value: FilterMap[F]["value"], args: FilterMap[F]["args"]): Promise<FilterMap[F]["value"]> {
  const entries = (await activeEntries(scope.companyId)).filter((e) => e.manifest.filters.includes(name));
  let current = value;
  for (const e of entries) {
    if (e.code) {
      const handlers = e.code.filters.get(name) ?? [];
      if (!handlers.length) continue;
      const ctx = await contextFor(e, scope.companyId, scope.user, scope.role);
      for (const { handler } of handlers) {
        try {
          const fn = handler as unknown as (v: typeof current, a: typeof args, c: PluginContext) => typeof current | Promise<typeof current>;
          const result = await withTimeout(fn(current, args, ctx), FILTER_TIMEOUT_MS, `${name} filter`);
          if (name === "document.beforeSave") current = guardCustomFields(e.plugin.id, current as FilterMap["document.beforeSave"]["value"], result as FilterMap["document.beforeSave"]["value"]) as typeof current;
          else if (name !== "document.validate") current = result ?? current;
        } catch (err) {
          if (name === "document.validate" && err instanceof UserError) throw err;
          await recordFailure(e.plugin.id, scope.companyId, `${name} filter`, err);
        }
      }
    } else if (name === "document.validate" && e.manifest.validateUrl) {
      await externalValidate(e, scope.companyId, args);
    }
  }
  return current;
}

/** External document.validate: signed POST; HTTP 422 { error } blocks the save, anything else lets it through. */
async function externalValidate(e: PluginEntry, companyId: string, args: unknown) {
  if (!e.cp?.webhookSecretEnc || !e.manifest.validateUrl) return;
  const body = JSON.stringify({ type: "document.validate", companyId, plugin: e.plugin.id, data: args });
  const ts = Math.floor(Date.now() / 1000);
  let res: Response;
  try {
    res = await safeFetch(
      e.manifest.validateUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "MyGST-Plugins/1", "X-MyGST-Timestamp": String(ts), "X-MyGST-Signature": signPayload(decryptSecret(e.cp.webhookSecretEnc), ts, body) },
        body,
      },
      EXTERNAL_FILTER_TIMEOUT_MS,
    );
  } catch (err) {
    await recordFailure(e.plugin.id, companyId, "document.validate", err);
    return;
  }
  if (res.status === 422) {
    const j = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new UserError(typeof j.error === "string" && j.error ? `${e.manifest.name}: ${j.error.slice(0, 300)}` : `${e.manifest.name} blocked this document`);
  }
  if (!res.ok) await recordFailure(e.plugin.id, companyId, "document.validate", new Error(`HTTP ${res.status}`));
  else await recordSuccess(e.plugin.id, companyId);
}

/** A plugin may only add/change/remove custom fields under its own "<pluginId>." prefix. */
function guardCustomFields(pluginId: string, before: FilterMap["document.beforeSave"]["value"], after: FilterMap["document.beforeSave"]["value"] | undefined) {
  if (!after || typeof after !== "object") return before;
  const prefix = `${pluginId}.`;
  const fields = Object.fromEntries(Object.entries(before.customFields).filter(([k]) => !k.startsWith(prefix)));
  for (const [k, v] of Object.entries(after.customFields ?? {})) {
    if (!k.startsWith(prefix) || !v || typeof v !== "object") continue;
    fields[k] = { label: String(v.label ?? "").slice(0, 60), value: String(v.value ?? "").slice(0, 300), onPdf: !!v.onPdf };
  }
  return { notes: typeof after.notes === "string" ? after.notes : before.notes, customFields: fields };
}
