import "server-only";
import { CODE_PLUGINS } from "@/plugins/registry.generated";
import { collectPlugin, type CollectedPlugin } from "./collect";

/**
 * Code plugins, loaded once per server process: each plugin's setup() runs against a collector that
 * records its hooks. A plugin with an invalid manifest or a throwing setup() is kept out (with the error
 * shown in Admin → Plugins) instead of breaking the app.
 */
export interface CodePlugin extends CollectedPlugin {
  folder: string;
}

export interface BrokenPlugin {
  folder: string;
  error: string;
}

let cache: { plugins: Map<string, CodePlugin>; broken: BrokenPlugin[] } | null = null;

function load() {
  const plugins = new Map<string, CodePlugin>();
  const broken: BrokenPlugin[] = [];
  for (const { folder, definition } of CODE_PLUGINS) {
    try {
      const p = collectPlugin(definition, folder);
      if (plugins.has(p.manifest.id)) throw new Error(`duplicate plugin id "${p.manifest.id}"`);
      plugins.set(p.manifest.id, { ...p, folder });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      broken.push({ folder, error: msg.slice(0, 500) });
      console.error(`[plugins] ${folder} failed to load: ${msg}`);
    }
  }
  return { plugins, broken };
}

export function codePlugins() {
  cache ??= load();
  return cache;
}

export const codePlugin = (id: string) => codePlugins().plugins.get(id) ?? null;
