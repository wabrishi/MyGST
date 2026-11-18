import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { PluginAvailability } from "@/generated/prisma/enums";
import { UserError } from "../action";
import { generateApiKey } from "../api/keys";
import { decryptSecret, encryptSecret } from "../backup/crypto";
import { db } from "../db";
import { BUILTIN_ROLE_ID } from "../permissions";
import { newEventId } from "../events/signing";
import { isPluginActive } from "./access";
import { postSigned } from "./delivery";
import { pluginLog } from "./log";
import { newPermissions, parseManifest, semverGte, type PluginManifest } from "./manifest";
import { safeFetch } from "./net";
import { codePlugins, type CodePlugin } from "./registry";
import { bundleSha256, codeFor, loadBundle } from "./uploaded";
import { contextFor, manifestOf, type PluginEntry } from "./runner";
import { prepareSettings } from "./settings";

/**
 * Plugin administration. Super admin: install/uninstall, availability (ALL | SELECTED | NONE), default on/off,
 * per-company allow/block. Owner: turn on/off for their company, settings. Lifecycle hooks (onEnable/onDisable,
 * external plugin.installed / plugin.uninstalled) fire whenever a company's *effective* state flips.
 */
const APP_VERSION = process.env.npm_package_version ?? "0.1.0";
const asJson = (v: unknown) => v as Prisma.InputJsonValue;

// ───────────────────────── Code plugin sync ─────────────────────────

/** Mirrors src/plugins into the Plugin table: new folders appear as NOT_INSTALLED, removed ones as MISSING. */
export async function syncCodePlugins() {
  const { plugins, broken } = codePlugins();
  const rows = await db.plugin.findMany({ where: { kind: "CODE" }, omit: { bundle: true } });
  const others = new Set((await db.plugin.findMany({ where: { kind: { not: "CODE" } }, select: { id: true } })).map((r) => r.id));
  for (const p of plugins.values()) {
    if (others.has(p.manifest.id)) {
      broken.push({ folder: p.folder, error: `id "${p.manifest.id}" is already used by an uploaded or external plugin` });
      continue;
    }
    const row = rows.find((r) => r.id === p.manifest.id);
    const data = { name: p.manifest.name, version: p.manifest.version, manifest: asJson(p.manifest) };
    if (!row) await db.plugin.create({ data: { id: p.manifest.id, kind: "CODE", ...data } });
    else if (row.version !== p.manifest.version || row.status === "MISSING" || row.name !== p.manifest.name) {
      await db.plugin.update({ where: { id: row.id }, data: { ...data, ...(row.status === "MISSING" && { status: row.installedAt ? "INSTALLED" : "NOT_INSTALLED" }), lastError: null } });
    }
  }
  for (const r of rows) {
    if (!plugins.has(r.id) && r.status !== "MISSING") {
      await db.plugin.update({ where: { id: r.id }, data: { status: "MISSING", lastError: broken.find((b) => b.folder === r.id)?.error ?? "Plugin folder not found in this build" } });
    }
  }
  return { broken };
}

// ───────────────────────── Effective-state changes → lifecycle ─────────────────────────

type Snapshot = Map<string, boolean>;

async function activeSnapshot(pluginId: string): Promise<Snapshot> {
  const plugin = await db.plugin.findUniqueOrThrow({ where: { id: pluginId } });
  const [companies, cps] = await Promise.all([
    db.company.findMany({ select: { id: true } }),
    db.companyPlugin.findMany({ where: { pluginId } }),
  ]);
  const byCompany = new Map(cps.map((c) => [c.companyId, c]));
  return new Map(companies.map((c) => [c.id, isPluginActive(plugin, byCompany.get(c.id))]));
}

/** Above this many companies, per-company lifecycle work runs after the response instead of blocking it. */
const INLINE_TRANSITIONS = 10;

/**
 * For companies whose effective state flipped: runs onEnable/onDisable (code) or sends
 * plugin.installed/uninstalled (external). Plugins without lifecycle work cost one query, however
 * many companies flip (an "All companies, on by default" install touches every company).
 */
async function fireTransitions(pluginId: string, before: Snapshot) {
  const after = await activeSnapshot(pluginId);
  const changes: Array<[string, boolean]> = [];
  for (const [companyId, now] of after) if ((before.get(companyId) ?? false) !== now) changes.push([companyId, now]);
  if (!changes.length) return 0;

  // Pending events for companies that lost the plugin will never be wanted now.
  const off = changes.filter(([, on]) => !on).map(([id]) => id);
  if (off.length) await db.outboxEvent.updateMany({ where: { pluginId, companyId: { in: off }, status: "PENDING" }, data: { status: "DEAD", lastError: "Plugin deactivated" } });
  const on = changes.length - off.length;
  await pluginLog(pluginId, null, "info", `Active in ${on} more and ${off.length} fewer compan${changes.length === 1 ? "y" : "ies"}`);

  const plugin = await db.plugin.findUnique({ where: { id: pluginId }, omit: { bundle: true } });
  const code = plugin && plugin.kind !== "EXTERNAL" ? await codeFor(plugin) : null;
  const hasWork = plugin?.kind === "EXTERNAL" || !!code?.lifecycle.onEnable || !!code?.lifecycle.onDisable;
  if (!hasWork) return changes.length;

  const run = async () => {
    for (const [companyId, isOn] of changes) {
      try {
        if (isOn) await onActivated(pluginId, companyId);
        else await onDeactivated(pluginId, companyId);
      } catch (e) {
        await pluginLog(pluginId, companyId, "error", `${isOn ? "enable" : "disable"} hook: ${(e as Error).message}`);
      }
    }
  };
  if (changes.length <= INLINE_TRANSITIONS) await run();
  else {
    try {
      const { after: afterResponse } = await import("next/server");
      afterResponse(run);
    } catch {
      await run(); // outside a request (scripts, tests)
    }
  }
  return changes.length;
}

async function entryFor(pluginId: string, companyId: string): Promise<PluginEntry | null> {
  const row = await db.plugin.findUnique({ where: { id: pluginId }, omit: { bundle: true }, include: { companies: { where: { companyId } } } });
  if (!row) return null;
  const { companies, ...plugin } = row;
  const manifest = manifestOf(plugin);
  if (!manifest) return null;
  const cp = companies[0] ?? null;
  return { plugin, cp, manifest, code: plugin.kind === "EXTERNAL" ? null : await codeFor(plugin), available: true, active: isPluginActive(plugin, cp) };
}

async function onActivated(pluginId: string, companyId: string) {
  const e = await entryFor(pluginId, companyId);
  if (!e) return;
  await db.companyPlugin.upsert({
    where: { companyId_pluginId: { companyId, pluginId } },
    create: { companyId, pluginId, enabledAt: new Date(), acceptedPermissions: asJson(e.manifest.permissions) },
    update: { enabledAt: new Date(), failureCount: 0 },
  });
  if (e.code?.lifecycle.onEnable) await e.code.lifecycle.onEnable(await contextFor(e, companyId));
  if (e.plugin.kind === "EXTERNAL") await externalInstallHandshake(e, companyId);
}

async function onDeactivated(pluginId: string, companyId: string) {
  const e = await entryFor(pluginId, companyId);
  if (!e) return;
  if (e.code?.lifecycle.onDisable) await e.code.lifecycle.onDisable(await contextFor(e, companyId));
  if (e.plugin.kind === "EXTERNAL" && e.cp) {
    if (e.cp.webhookSecretEnc && e.manifest.webhookUrl) {
      const id = newEventId();
      await postSigned(e.manifest.webhookUrl, e.cp.webhookSecretEnc, id, JSON.stringify({ id, type: "plugin.uninstalled", source: "gst", companyId, occurredAt: new Date().toISOString(), data: {} }));
    }
    if (e.cp.apiKeyId) await db.apiKey.updateMany({ where: { id: e.cp.apiKeyId, revokedAt: null }, data: { revokedAt: new Date() } });
    await db.companyPlugin.update({ where: { id: e.cp.id }, data: { apiKeyId: null } });
  }
}

/**
 * External plugins: a fresh API key (scoped to the plugin's permissions) and webhook secret for this
 * company, delivered in a signed plugin.installed event. If the plugin can't be reached it is still
 * active; the owner can retry from the settings page ("Reconnect").
 */
export async function externalInstallHandshake(e: PluginEntry, companyId: string) {
  if (!e.manifest.webhookUrl && !e.manifest.pageBaseUrl) return;
  const cp = await db.companyPlugin.findUniqueOrThrow({ where: { companyId_pluginId: { companyId, pluginId: e.plugin.id } } });
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const actingUserId =
    cp.enabledBy ?? (await db.membership.findFirst({ where: { companyId, roles: { some: { roleId: BUILTIN_ROLE_ID.OWNER } } }, orderBy: { createdAt: "asc" }, select: { userId: true } }))?.userId;
  if (!actingUserId) throw new Error("No owner to issue the plugin's API key");
  if (cp.apiKeyId) await db.apiKey.updateMany({ where: { id: cp.apiKeyId, revokedAt: null }, data: { revokedAt: new Date() } });
  const key = generateApiKey();
  const apiKey = await db.apiKey.create({
    data: { companyId, name: `Plugin: ${e.manifest.name}`, prefix: key.prefix, keyHash: key.hash, createdById: actingUserId, pluginId: e.plugin.id, scopes: asJson(e.manifest.permissions) },
  });
  const secretEnc = encryptSecret(secret);
  await db.companyPlugin.update({ where: { id: cp.id }, data: { webhookSecretEnc: secretEnc, apiKeyId: apiKey.id } });
  if (!e.manifest.webhookUrl) return;
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { legalName: true, tradeName: true, gstin: true, stateCode: true } });
  const id = newEventId();
  const appUrl = (process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
  const body = JSON.stringify({
    id,
    type: "plugin.installed",
    source: "gst",
    companyId,
    occurredAt: new Date().toISOString(),
    data: { company: { id: companyId, ...company }, apiKey: key.key, apiBaseUrl: `${appUrl}/api/v1`, webhookSecret: secret, permissions: e.manifest.permissions, settings: {} },
  });
  // The first delivery is signed with the new secret, so the plugin can verify it after reading data.webhookSecret.
  const r = await postSigned(e.manifest.webhookUrl, secretEnc, id, body);
  if (!r.ok) await pluginLog(e.plugin.id, companyId, "warn", `plugin.installed not delivered: ${r.error}. Use "Reconnect" in the plugin settings.`);
}

// ───────────────────────── Super admin ─────────────────────────

export async function installPlugin(pluginId: string, opts: { availability: PluginAvailability; defaultEnabled: boolean; by: string }) {
  const p = await db.plugin.findUnique({ where: { id: pluginId } });
  if (!p) throw new UserError("Plugin not found");
  if (p.status === "MISSING") throw new UserError("This plugin's code is missing from the current build");
  const manifest = manifestOf(p);
  if (!manifest) throw new UserError("Plugin manifest is invalid");
  if (manifest.minAppVersion && !semverGte(APP_VERSION, manifest.minAppVersion)) throw new UserError(`Needs MyGST ${manifest.minAppVersion} or newer (this is ${APP_VERSION})`);
  const before = await activeSnapshot(pluginId);
  const first = p.status !== "INSTALLED";
  await db.plugin.update({ where: { id: pluginId }, data: { status: "INSTALLED", availability: opts.availability, defaultEnabled: opts.defaultEnabled, installedAt: new Date(), installedBy: opts.by, lastError: null } });
  if (first) {
    const code = p.kind === "EXTERNAL" ? null : await codeFor(p);
    try {
      await code?.lifecycle.onInstall?.();
    } catch (e) {
      await pluginLog(pluginId, null, "error", `onInstall: ${(e as Error).message}`);
    }
    await pluginLog(pluginId, null, "info", `Installed by super admin (available: ${opts.availability}, on by default: ${opts.defaultEnabled ? "yes" : "no"})`);
  }
  return fireTransitions(pluginId, before);
}

export async function setAvailability(pluginId: string, opts: { availability?: PluginAvailability; defaultEnabled?: boolean }) {
  const before = await activeSnapshot(pluginId);
  await db.plugin.update({ where: { id: pluginId }, data: { ...(opts.availability && { availability: opts.availability }), ...(opts.defaultEnabled !== undefined && { defaultEnabled: opts.defaultEnabled }) } });
  await pluginLog(pluginId, null, "info", `Availability: ${JSON.stringify(opts)}`);
  return fireTransitions(pluginId, before);
}

/** Allow (SELECTED mode) or block (ALL mode) one company. */
export async function setCompanyAccess(pluginId: string, companyId: string, access: { allowed?: boolean; blocked?: boolean }) {
  const before = await activeSnapshot(pluginId);
  await db.companyPlugin.upsert({
    where: { companyId_pluginId: { companyId, pluginId } },
    create: { companyId, pluginId, allowed: !!access.allowed, blocked: !!access.blocked },
    update: access,
  });
  return fireTransitions(pluginId, before);
}

/** Uninstall: deactivates everywhere (disable hooks), runs onUninstall, deletes the plugin's data. External plugins are removed entirely. */
export async function uninstallPlugin(pluginId: string, opts: { keepData: boolean }) {
  const p = await db.plugin.findUnique({ where: { id: pluginId } });
  if (!p) throw new UserError("Plugin not found");
  const before = await activeSnapshot(pluginId);
  await db.plugin.update({ where: { id: pluginId }, data: { availability: "NONE" } });
  await fireTransitions(pluginId, before);
  if (p.kind !== "EXTERNAL") {
    try {
      await (await codeFor(p))?.lifecycle.onUninstall?.();
    } catch (e) {
      await pluginLog(pluginId, null, "error", `onUninstall: ${(e as Error).message}`);
    }
  }
  await db.apiKey.updateMany({ where: { pluginId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (p.kind === "EXTERNAL" || p.kind === "UPLOADED") {
    await db.plugin.delete({ where: { id: pluginId } }); // cascades settings, data, logs (and the uploaded bundle)
    return;
  }
  if (!opts.keepData) {
    await db.pluginData.deleteMany({ where: { pluginId } });
    await db.pluginRecord.deleteMany({ where: { pluginId } });
    await db.pluginJobRun.deleteMany({ where: { pluginId } });
    await db.companyPlugin.deleteMany({ where: { pluginId } });
  }
  await db.plugin.update({ where: { id: pluginId }, data: { status: "NOT_INSTALLED", defaultEnabled: false, installedAt: null, installedBy: null } });
  await pluginLog(pluginId, null, "info", `Uninstalled${opts.keepData ? " (data kept)" : ""}`);
}

/** Fetches and validates an external plugin's manifest (https; private addresses refused in production). */
export async function fetchExternalManifest(url: string): Promise<PluginManifest> {
  let res: Response;
  try {
    res = await safeFetch(url, { headers: { Accept: "application/json", "User-Agent": "MyGST-Plugins/1" } }, 10_000);
  } catch (e) {
    throw new UserError(`Couldn't fetch the manifest: ${(e as Error).message}`);
  }
  if (!res.ok) throw new UserError(`Couldn't fetch the manifest: HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 100_000) throw new UserError("Manifest is too large");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new UserError("Manifest is not valid JSON");
  }
  return parseManifest(raw, "EXTERNAL");
}

/** Adds (or updates) an external plugin from its manifest URL. Installing it is a separate step. */
export async function addExternalPlugin(url: string) {
  const manifest = await fetchExternalManifest(url);
  const existing = await db.plugin.findUnique({ where: { id: manifest.id } });
  if (existing && existing.kind !== "EXTERNAL") throw new UserError(`A ${existing.kind === "CODE" ? "built-in" : "uploaded"} plugin already uses the id "${manifest.id}"`);
  if (existing && existing.manifestUrl !== url) throw new UserError(`Another external plugin already uses the id "${manifest.id}"`);
  const data = { name: manifest.name, version: manifest.version, manifest: asJson(manifest), manifestUrl: url, lastError: null };
  if (existing) await db.plugin.update({ where: { id: manifest.id }, data });
  else await db.plugin.create({ data: { id: manifest.id, kind: "EXTERNAL", ...data } });
  return { id: manifest.id, permissionsAdded: existing ? newPermissions(manifestOf(existing)?.permissions, manifest.permissions) : [] };
}

// ───────────────────────── Uploaded plugins ─────────────────────────

export interface UploadPreview {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  permissions: string[];
  sha256: string;
  sizeBytes: number;
  existingVersion: string | null;
  permissionsAdded: string[];
  downgrade: boolean;
}

/** Validates a packed bundle without saving it (what the admin confirms before uploading). */
export async function previewUpload(code: string): Promise<UploadPreview> {
  let p: CodePlugin;
  try {
    p = loadBundle(code);
  } catch (e) {
    throw new UserError(`This isn't a valid plugin bundle: ${(e as Error).message}`);
  }
  const m = p.manifest;
  const existing = await db.plugin.findUnique({ where: { id: m.id }, omit: { bundle: true } });
  if (existing && existing.kind !== "UPLOADED") throw new UserError(`A ${existing.kind === "CODE" ? "built-in" : "external"} plugin already uses the id "${m.id}"`);
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    description: m.description ?? "",
    author: m.author ?? "",
    permissions: m.permissions,
    sha256: bundleSha256(code),
    sizeBytes: Buffer.byteLength(code, "utf8"),
    existingVersion: existing?.version ?? null,
    permissionsAdded: existing ? newPermissions(manifestOf(existing)?.permissions, m.permissions) : [],
    downgrade: !!existing && !semverGte(m.version, existing.version),
  };
}

/** Saves an uploaded bundle (new plugin, or an upgrade of an uploaded one). Installing is a separate step. */
export async function saveUpload(code: string, opts: { by: string; expectSha256: string; allowDowngrade: boolean }) {
  const preview = await previewUpload(code);
  if (preview.sha256 !== opts.expectSha256) throw new UserError("The file changed after the preview. Choose it again.");
  if (preview.downgrade && !opts.allowDowngrade) throw new UserError(`Version ${preview.version} is older than the installed ${preview.existingVersion}. Tick "allow downgrade" to replace it.`);
  const manifest = loadBundle(code).manifest;
  const data = { name: manifest.name, version: manifest.version, manifest: asJson(manifest), bundle: code, bundleSha256: preview.sha256, uploadedBy: opts.by, lastError: null };
  const existing = await db.plugin.findUnique({ where: { id: manifest.id }, select: { id: true } });
  if (existing) await db.plugin.update({ where: { id: manifest.id }, data });
  else await db.plugin.create({ data: { id: manifest.id, kind: "UPLOADED", ...data } });
  await pluginLog(manifest.id, null, "info", `${existing ? "Updated to" : "Uploaded"} v${manifest.version} by ${opts.by} (sha256 ${preview.sha256.slice(0, 12)}…)`);
  return preview;
}

// ───────────────────────── Owner ─────────────────────────

/** Owner turns the plugin on/off for their company (only when the super admin made it available). */
export async function setCompanyEnabled(pluginId: string, companyId: string, enabled: boolean, by: string) {
  const plugin = await db.plugin.findUnique({ where: { id: pluginId }, include: { companies: { where: { companyId } } } });
  if (!plugin || plugin.status !== "INSTALLED") throw new UserError("Plugin not found");
  const { isAvailableTo } = await import("./access");
  if (!isAvailableTo(plugin, plugin.companies[0])) throw new UserError("This plugin isn't available to your company");
  const manifest = manifestOf(plugin);
  const before = await activeSnapshot(pluginId);
  await db.companyPlugin.upsert({
    where: { companyId_pluginId: { companyId, pluginId } },
    create: { companyId, pluginId, enabled, enabledBy: by, acceptedPermissions: asJson(manifest?.permissions ?? []) },
    // Turning on again also clears an auto-pause.
    update: { enabled, enabledBy: by, ...(enabled && { pausedReason: null, failureCount: 0, acceptedPermissions: asJson(manifest?.permissions ?? []) }) },
  });
  await fireTransitions(pluginId, before);
}

export async function saveCompanySettings(pluginId: string, companyId: string, input: Record<string, unknown>, clearSecrets: string[] = []) {
  const plugin = await db.plugin.findUnique({ where: { id: pluginId }, include: { companies: { where: { companyId } } } });
  const manifest = plugin && manifestOf(plugin);
  if (!plugin || !manifest) throw new UserError("Plugin not found");
  const { stored, errors } = prepareSettings(manifest.settings, input, plugin.companies[0]?.settings, clearSecrets);
  const first = Object.entries(errors)[0];
  if (first) throw new UserError(first[1], first[0]);
  await db.companyPlugin.upsert({
    where: { companyId_pluginId: { companyId, pluginId } },
    create: { companyId, pluginId, settings: asJson(stored) },
    update: { settings: asJson(stored) },
  });
}

/** External plugins: re-run the install handshake (new key + secret) for one company. */
export async function reconnectExternal(pluginId: string, companyId: string) {
  const e = await entryFor(pluginId, companyId);
  if (!e || !e.active || e.plugin.kind !== "EXTERNAL") throw new UserError("Plugin isn't active for this company");
  await externalInstallHandshake(e, companyId);
}

export const decryptPluginSecret = (enc: string | null | undefined) => (enc ? decryptSecret(enc) : null);
