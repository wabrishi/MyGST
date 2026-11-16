import { collectPlugin, type CollectedPlugin } from "./collect";
import type { PluginEvent, PluginFilter, PluginManifest } from "./manifest";
import type { FilterMap, PluginContext, PluginDataApi, PluginDefinition, SettingValue } from "./sdk";

/**
 * Test helpers for plugin authors (no database, no server):
 *
 *   const p = loadForTest(plugin);
 *   const ctx = createPluginTestContext({ manifest: p.manifest, settings: { webhookUrl: "https://…" } });
 *   await p.emit("invoice.issued", { number: "INV/1" }, ctx);
 *   const out = await p.applyFilter("pdf.sections", [], { document }, ctx);
 */
export function loadForTest(definition: PluginDefinition) {
  const p = collectPlugin(definition);
  return {
    ...p,
    async emit(event: PluginEvent, data: Record<string, unknown>, ctx: PluginContext, id = `evt_test_${Math.random().toString(36).slice(2)}`) {
      for (const { handler } of p.actions.get(event) ?? []) {
        await handler({ id, type: event, occurredAt: new Date().toISOString(), companyId: ctx.companyId, data }, ctx);
      }
    },
    async applyFilter<F extends PluginFilter>(name: F, value: FilterMap[F]["value"], args: FilterMap[F]["args"], ctx: PluginContext): Promise<FilterMap[F]["value"]> {
      let current = value;
      for (const { handler } of p.filters.get(name) ?? []) {
        const fn = handler as unknown as (v: typeof current, a: typeof args, c: PluginContext) => typeof current | Promise<typeof current>;
        const r = await fn(current, args, ctx);
        if (name !== "document.validate") current = r ?? current;
      }
      return current;
    },
  } satisfies CollectedPlugin & Record<string, unknown>;
}

export interface TestContext extends PluginContext {
  logs: Array<{ level: "info" | "warn" | "error"; message: string }>;
  store: Map<string, unknown>;
  requests: Array<{ url: string; init?: RequestInit }>;
}

/** A PluginContext with in-memory storage, captured logs and http, and data methods you can stub. */
export function createPluginTestContext(opts: {
  manifest: PluginManifest;
  settings?: Record<string, SettingValue>;
  companyId?: string;
  data?: Partial<{ [K in keyof PluginDataApi]: Partial<PluginDataApi[K]> }>;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}): TestContext {
  const logs: TestContext["logs"] = [];
  const store = new Map<string, unknown>();
  const requests: TestContext["requests"] = [];
  const missing = (name: string) => () => {
    throw new Error(`ctx.data.${name} is not stubbed in this test (pass it in createPluginTestContext({ data }))`);
  };
  const stub = <T extends object>(group: string, given: Partial<T> | undefined, keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, (given as Record<string, unknown> | undefined)?.[k] ?? missing(`${group}.${k}`)])) as T;
  const companyId = opts.companyId ?? "company_test";
  const defaults = Object.fromEntries(opts.manifest.settings.map((s) => [s.key, s.default ?? (s.type === "boolean" ? false : s.type === "number" ? 0 : "")]));
  return {
    pluginId: opts.manifest.id,
    companyId,
    company: { id: companyId, legalName: "Test Traders Pvt Ltd", tradeName: "Test Traders", gstin: "27AAPFU0939F1ZV", stateCode: "27" },
    user: null,
    role: null,
    settings: { ...defaults, ...opts.settings },
    storage: {
      get: async <T>(k: string) => (store.has(k) ? (store.get(k) as T) : null),
      set: async (k, v) => void store.set(k, v),
      delete: async (k) => void store.delete(k),
      list: async (prefix = "") => [...store].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value })),
    },
    log: {
      info: (message) => void logs.push({ level: "info", message }),
      warn: (message) => void logs.push({ level: "warn", message }),
      error: (message) => void logs.push({ level: "error", message }),
    },
    data: {
      company: opts.data?.company ?? (missing("company") as PluginDataApi["company"]),
      documents: stub("documents", opts.data?.documents, ["list", "get", "setCustomField", "createQuotation"]),
      parties: stub("parties", opts.data?.parties, ["list", "upsert"]),
      products: stub("products", opts.data?.products, ["list"]),
      payments: stub("payments", opts.data?.payments, ["receivables"]),
      purchases: stub("purchases", opts.data?.purchases, ["list"]),
    } as PluginDataApi,
    http: {
      fetch: async (url, init) => {
        requests.push({ url, init });
        return opts.fetch ? opts.fetch(url, init) : new Response("ok", { status: 200 });
      },
    },
    appUrl: (path) => `https://mygst.test${path.startsWith("/") ? path : `/${path}`}`,
    logs,
    store,
    requests,
  };
}
