#!/usr/bin/env node
/**
 * Packs a plugin into one file that a MyGST admin can upload (Admin → Plugins → Upload a plugin):
 *
 *   npm run plugin:pack -- <plugin-folder> [--id new-id]
 *
 * Bundles src/plugins/<folder>/index.ts(x) and everything it imports into a CommonJS file. react,
 * react/jsx-runtime and @/lib/plugins/sdk stay external: MyGST provides them at load time. Output:
 * dist-plugins/<id>-<version>.mygst-plugin.js, plus its SHA-256 (publish it so admins can check it).
 * `--id` re-brands the copy under another id (useful for testing an upload next to the built-in one).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--"));
const idFlag = args.indexOf("--id");
const newId = idFlag >= 0 ? args[idFlag + 1] : null;
if (!folder) {
  console.error("Usage: npm run plugin:pack -- <plugin-folder> [--id new-id]");
  process.exit(1);
}
const root = resolve(import.meta.dirname, "..");
const dir = join(root, "src", "plugins", folder);
const entry = ["index.tsx", "index.ts"].map((f) => join(dir, f)).find(existsSync);
if (!entry) {
  console.error(`No index.ts(x) in src/plugins/${folder}`);
  process.exit(1);
}

const EXTERNAL = ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "@/lib/plugins/sdk"];
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

// Read the manifest by running the bundle against a stub SDK (react is the real one).
const { createRequire } = await import("node:module");
const req = createRequire(join(root, "package.json"));
const stubSdk = { definePlugin: (d) => d, PluginError: class PluginError extends Error {} };
const load = (src) => {
  const mod = { exports: {} };
  // Strict mode, like MyGST's loader.
  new Function("module", "exports", "require", `"use strict";\n${src}`)(mod, mod.exports, (n) => (n === "@/lib/plugins/sdk" ? stubSdk : req(n)));
  return mod.exports.default ?? mod.exports;
};
const def = load(code);
const manifest = def?.manifest;
if (!manifest?.id || !manifest?.version) {
  console.error("The plugin's default export must be definePlugin({ manifest: { id, version, … }, setup })");
  process.exit(1);
}
if (newId) {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(newId)) {
    console.error("--id must be lowercase letters, numbers and dashes");
    process.exit(1);
  }
  // Wrap the default export so the manifest carries the new id (and a marked name). esbuild exports
  // `default` as a getter, so module.exports is replaced rather than assigned to.
  code += `\n;(function(){var d=module.exports.default||module.exports;var m=Object.assign({},d.manifest,{id:${JSON.stringify(newId)},name:d.manifest.name+" (${newId})"});module.exports={__esModule:true,default:Object.assign({},d,{manifest:m})};})();\n`;
  if (load(code)?.manifest?.id !== newId) {
    console.error("Re-branding failed");
    process.exit(1);
  }
  manifest.id = newId;
}

const header = `/*! mygst-plugin ${manifest.id}@${manifest.version} — packed ${new Date().toISOString()} */\n`;
const out = header + code;
const sha = createHash("sha256").update(out, "utf8").digest("hex");
const outDir = join(root, "dist-plugins");
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${manifest.id}-${manifest.version}.mygst-plugin.js`);
writeFileSync(file, out);
const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
console.log(`Packed ${manifest.id}@${manifest.version} → ${file} (${kb} KB)`);
console.log(`SHA-256 ${sha}`);
if (Buffer.byteLength(out) > 2 * 1024 * 1024) console.warn("Warning: larger than the 2 MB upload limit.");
