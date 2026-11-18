import "server-only";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { codePlugin } from "./registry";

/**
 * Built-in plugins packed into upload-ready bundles (dist-plugins/<id>-<version>.mygst-plugin.js).
 * `npm run build` packs them all; if one is missing (e.g. in dev) it is packed on demand.
 */
const fileFor = (id: string, version: string) => join(process.cwd(), "dist-plugins", `${id}-${version}.mygst-plugin.js`);

function packNow(folder: string) {
  return new Promise<void>((resolve, reject) =>
    execFile(process.execPath, [join(process.cwd(), "scripts", "pack-plugin.mjs"), folder], { cwd: process.cwd(), timeout: 60_000 }, (err) => (err ? reject(err) : resolve())),
  );
}

export async function builtInBundle(id: string, version: string): Promise<string | null> {
  const plugin = codePlugin(id);
  if (!plugin) return null;
  const file = fileFor(id, plugin.manifest.version || version);
  const read = () => readFile(file, "utf8").catch(() => null);
  const existing = await read();
  if (existing) return existing;
  try {
    await packNow(plugin.folder);
  } catch (e) {
    console.error(`[plugins] packing ${id} failed: ${(e as Error).message}`);
    return null;
  }
  return read();
}
