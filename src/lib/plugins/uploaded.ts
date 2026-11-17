import "server-only";
import { createHash } from "node:crypto";
import * as nodeCrypto from "node:crypto";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { db } from "../db";
import { collectPlugin } from "./collect";
import { codePlugin, type CodePlugin } from "./registry";
import * as sdk from "./sdk";

/**
 * Uploaded plugins (Admin → Plugins → Upload): a CommonJS bundle made by `npm run plugin:pack`, stored in
 * the database so redeploys keep it. TRUSTED CODE — it runs inside MyGST like a built-in plugin; only
 * admins with plugins.upload can add one. The loader hands the bundle only react, react/jsx-runtime,
 * node:crypto and the plugin SDK, so plugins can't import the database client.
 */

export const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;

const MODULES: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "react/jsx-dev-runtime": jsxRuntime,
  "@/lib/plugins/sdk": sdk,
  "node:crypto": nodeCrypto,
  crypto: nodeCrypto,
};

export const bundleSha256 = (code: string) => createHash("sha256").update(code, "utf8").digest("hex");

/** Runs the bundle and returns its default export (the definePlugin(...) result). */
export function evaluateBundle(code: string): unknown {
  if (Buffer.byteLength(code, "utf8") > MAX_BUNDLE_BYTES) throw new Error("Bundle is larger than 2 MB");
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  const requireShim = (name: string) => {
    if (name in MODULES) return MODULES[name];
    throw new Error(`Uploaded plugins can only import react and @/lib/plugins/sdk (bundle everything else) — got "${name}"`);
  };
  // Trusted, admin-uploaded plugin code.
  const fn = new Function("module", "exports", "require", `"use strict";\n${code}\n//# sourceURL=mygst-plugin.js`);
  fn(mod, mod.exports, requireShim);
  const exp = mod.exports as { default?: unknown; __esModule?: boolean };
  return exp.default ?? exp;
}

/** Evaluates and validates a bundle (manifest, pages/widgets) like a built-in plugin. */
export function loadBundle(code: string, expectedId?: string): CodePlugin {
  const collected = collectPlugin(evaluateBundle(code) as never); // no folder: an upload has no folder name to match
  if (expectedId && collected.manifest.id !== expectedId) throw new Error(`The bundle is for "${collected.manifest.id}", not "${expectedId}"`);
  return { ...collected, folder: `upload:${collected.manifest.id}` };
}

// Compiled bundles, per server process, keyed by id@sha256 (a new upload has a new hash).
const compiled = new Map<string, CodePlugin>();
const failed = new Map<string, string>();

export function uploadedLoadError(id: string, sha: string | null) {
  return sha ? (failed.get(`${id}@${sha}`) ?? null) : null;
}

/** The code behind a plugin row: built-in (from this build) or uploaded (from the database). */
export async function codeFor(plugin: { id: string; kind: string; bundleSha256?: string | null }): Promise<CodePlugin | null> {
  if (plugin.kind === "CODE") return codePlugin(plugin.id);
  if (plugin.kind !== "UPLOADED" || !plugin.bundleSha256) return null;
  const key = `${plugin.id}@${plugin.bundleSha256}`;
  const hit = compiled.get(key);
  if (hit) return hit;
  if (failed.has(key)) return null;
  const row = await db.plugin.findUnique({ where: { id: plugin.id }, select: { bundle: true, bundleSha256: true } });
  if (!row?.bundle || row.bundleSha256 !== plugin.bundleSha256) return null;
  try {
    const p = loadBundle(row.bundle, plugin.id);
    compiled.set(key, p);
    return p;
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    failed.set(key, msg);
    console.error(`[plugins] uploaded ${plugin.id} failed to load: ${msg}`);
    return null;
  }
}
