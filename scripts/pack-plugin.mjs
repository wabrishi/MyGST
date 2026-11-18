#!/usr/bin/env node
/**
 * Packs a plugin into one file that a MyGST admin can upload (Admin → Plugins → Upload a plugin):
 *
 *   npm run plugin:pack -- <plugin-folder> [--id new-id]
 *   npm run plugin:pack -- --all            (every folder in src/plugins; run by `npm run build`)
 *
 * Bundles src/plugins/<folder>/index.ts(x) and everything it imports into a CommonJS file. react,
 * react/jsx-runtime and @/lib/plugins/sdk stay external: MyGST provides them at load time. Output:
 * dist-plugins/<id>-<version>.mygst-plugin.js, plus its SHA-256 (publish it so admins can check it).
 * `--id` re-brands the copy under another id (useful for testing an upload next to the built-in one).
 * Super admins can download these files from Admin → Plugins.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const pluginsDir = join(root, "src", "plugins");
const outDir = join(root, "dist-plugins");
const EXTERNAL = ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "@/lib/plugins/sdk"];

// Reads the manifest by running the bundle against a stub SDK (react is the real one). Strict mode,
// like MyGST's loader. The stub mirrors the SDK's runtime exports (UI kit components are plain stubs).
const req = createRequire(join(root, "package.json"));
const stubSdk = new Proxy(
  { definePlugin: (d) => d, PluginError: class PluginError extends Error {} },
  { get: (t, k) => (k in t ? t[k] : typeof k === "string" && /^[A-Z]/.test(k) ? () => null : undefined) },
);
const load = (src) => {
  const mod = { exports: {} };
  new Function("module", "exports", "require", `"use strict";\n${src}`)(mod, mod.exports, (n) => (n === "@/lib/plugins/sdk" ? stubSdk : req(n)));
  return mod.exports.default ?? mod.exports;
};

async function pack(folder, newId = null) {
  const dir = join(pluginsDir, folder);
  const entry = ["index.tsx", "index.ts"].map((f) => join(dir, f)).find(existsSync);
  if (!entry) throw new Error(`No index.ts(x) in src/plugins/${folder}`);
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    target: "node20",
    jsx: "automatic",
    external: EXTERNAL,
    legalComments: "none",
    logLevel: "warning",
    plugins: [
      {
        // Plugins may only reach MyGST through the SDK (same rule as the lint check for src/plugins).
        name: "mygst-guard",
        setup(b) {
          b.onResolve({ filter: /^@\// }, (a) =>
            EXTERNAL.includes(a.path) ? { path: a.path, external: true } : { errors: [{ text: `${a.path}: plugins may only import @/lib/plugins/sdk from MyGST` }] },
          );
        },
      },
    ],
  });
  let code = result.outputFiles[0].text;
  const manifest = load(code)?.manifest;
  if (!manifest?.id || !manifest?.version) throw new Error("The plugin's default export must be definePlugin({ manifest: { id, version, … }, setup })");
  if (newId) {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(newId)) throw new Error("--id must be lowercase letters, numbers and dashes");
    // Wrap the default export so the manifest carries the new id (and a marked name). esbuild exports
    // `default` as a getter, so module.exports is replaced rather than assigned to.
    code += `\n;(function(){var d=module.exports.default||module.exports;var m=Object.assign({},d.manifest,{id:${JSON.stringify(newId)},name:d.manifest.name+" (${newId})"});module.exports={__esModule:true,default:Object.assign({},d,{manifest:m})};})();\n`;
    if (load(code)?.manifest?.id !== newId) throw new Error("Re-branding failed");
    manifest.id = newId;
  }
  const out = `/*! mygst-plugin ${manifest.id}@${manifest.version} */\n` + code;
  const sha = createHash("sha256").update(out, "utf8").digest("hex");
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${manifest.id}-${manifest.version}.mygst-plugin.js`);
  writeFileSync(file, out);
  const bytes = Buffer.byteLength(out);
  console.log(`Packed ${manifest.id}@${manifest.version} → ${file} (${(bytes / 1024).toFixed(1)} KB)`);
  console.log(`SHA-256 ${sha}`);
  if (bytes > 2 * 1024 * 1024) console.warn("Warning: larger than the 2 MB upload limit.");
  return { id: manifest.id, version: manifest.version, file, sha };
}

const args = process.argv.slice(2);
if (args.includes("--all")) {
  // Build step: a plugin that fails to pack is reported but doesn't fail the build.
  const folders = existsSync(pluginsDir) ? readdirSync(pluginsDir).filter((f) => statSync(join(pluginsDir, f)).isDirectory()) : [];
  let failed = 0;
  for (const folder of folders) {
    try {
      await pack(folder);
    } catch (e) {
      failed++;
      console.warn(`[plugin:pack] ${folder}: ${e.message}`);
    }
  }
  console.log(`Packed ${folders.length - failed} of ${folders.length} plugins into dist-plugins/`);
} else {
  const idFlag = args.indexOf("--id");
  const folder = args.find((a, i) => !a.startsWith("--") && !(idFlag >= 0 && i === idFlag + 1));
  if (!folder) {
    console.error("Usage: npm run plugin:pack -- <plugin-folder> [--id new-id]   |   npm run plugin:pack -- --all");
    process.exit(1);
  }
  try {
    await pack(folder, idFlag >= 0 ? args[idFlag + 1] : null);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
