import { parseManifest, type PluginEvent, type PluginFilter, type PluginManifest } from "./manifest";
import type { ActionHandler, LifecycleHandlers, PageComponent, PluginApi, PluginDefinition, RouteHandler, WidgetComponent } from "./sdk";

/** Runs a plugin's setup() against a collector and returns its validated manifest + hooks. Pure (no database). */
type Prioritized<T> = { handler: T; priority: number };

export interface CollectedPlugin {
  manifest: PluginManifest;
  actions: Map<PluginEvent, Array<Prioritized<ActionHandler>>>;
  // Filter handlers are stored untyped; runner.applyFilters restores the types per filter name.
  filters: Map<PluginFilter, Array<Prioritized<(...a: never[]) => unknown>>>;
  pages: Map<string, PageComponent>;
  widgets: Map<string, WidgetComponent>;
  settingsPage: PageComponent | null;
  routes: Array<{ method: string; path: string; handler: RouteHandler; public: boolean; roles: string[] | null }>;
  lifecycle: LifecycleHandlers;
}

export function collectPlugin(definition: PluginDefinition, folder?: string): CollectedPlugin {
  const manifest = parseManifest(definition?.manifest, "CODE");
  if (folder && manifest.id !== folder) throw new Error(`manifest id "${manifest.id}" must match the folder name "${folder}"`);
  const p: CollectedPlugin = { manifest, actions: new Map(), filters: new Map(), pages: new Map(), widgets: new Map(), settingsPage: null, routes: [], lifecycle: {} };
  const push = <K, T>(map: Map<K, Array<Prioritized<T>>>, key: K, handler: T, priority = 10) => {
    const list = map.get(key) ?? [];
    list.push({ handler, priority });
    list.sort((a, b) => a.priority - b.priority);
    map.set(key, list);
  };
  const api: PluginApi = {
    on(event, handler, opts) {
      if (!manifest.events.includes(event)) throw new Error(`api.on("${event}"): add "${event}" to manifest.events`);
      push(p.actions, event, handler, opts?.priority);
    },
    filter(name, handler, opts) {
      if (!manifest.filters.includes(name)) throw new Error(`api.filter("${name}"): add "${name}" to manifest.filters`);
      push(p.filters, name, handler as unknown as (...a: never[]) => unknown, opts?.priority);
    },
    page(slug, component) {
      if (!manifest.pages.some((pg) => pg.slug === slug)) throw new Error(`api.page("${slug}"): declare it in manifest.pages`);
      p.pages.set(slug, component);
    },
    widget(id, component) {
      if (!manifest.widgets.some((w) => w.id === id)) throw new Error(`api.widget("${id}"): declare it in manifest.widgets`);
      p.widgets.set(id, component);
    },
    settingsPage(component) {
      p.settingsPage = component;
    },
    route(method, path, handler, opts) {
      const clean = path.replace(/^\/+|\/+$/g, "");
      if (!/^[a-z0-9][a-z0-9/_*-]*$/i.test(clean)) throw new Error(`api.route path "${path}" may only use letters, digits, / _ - (and a trailing /*)`);
      p.routes.push({ method, path: clean, handler, public: !!opts?.public, roles: opts?.roles ?? null });
    },
    lifecycle(handlers) {
      p.lifecycle = { ...p.lifecycle, ...handlers };
    },
  };
  definition.setup(api);
  for (const pg of manifest.pages) if (!p.pages.has(pg.slug)) throw new Error(`manifest.pages "${pg.slug}" has no api.page() component`);
  for (const w of manifest.widgets) if (!p.widgets.has(w.id)) throw new Error(`manifest.widgets "${w.id}" has no api.widget() component`);
  return p;
}
