import { UserError } from "../user-error";
import { collectPlugin, type CollectedPlugin } from "./collect";
import type { PluginEvent, PluginFilter, PluginManifest } from "./manifest";
import { buildOrder, cleanData, clampFindLimit, collectionSpec, indexColumns, RecordQueryError, type Condition, type RecordWhere } from "./record-query";
import type { Collection, PluginDb, StoredRecord } from "./records";
import type { FilterMap, FormActionResult, PluginContext, PluginDataApi, PluginDefinition, SettingValue } from "./sdk";

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
    /** Runs api.action(name) like a form post; returns its result, or { error } for a PluginError. */
    async runAction(name: string, values: Record<string, string>, ctx: PluginContext): Promise<FormActionResult & { error?: string }> {
      const a = p.formActions.get(name);
      if (!a) throw new Error(`No api.action("${name}")`);
      if (a.permission && !ctx.can(a.permission)) return { error: "You don't have permission to do that" };
      const form = new FormData();
      for (const [k, v] of Object.entries(values)) form.set(k, v);
      try {
        return (await a.handler(form, ctx)) ?? {};
      } catch (e) {
        if (e instanceof UserError) return { error: e.message };
        throw e;
      }
    },
    async runJob(id: string, ctx: PluginContext) {
      const j = p.jobs.get(id);
      if (!j) throw new Error(`No api.schedule("${id}")`);
      await j(ctx);
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
  /** Emails passed to ctx.mail.send. */
  mails: Array<{ toUserIds?: string[]; toPartyId?: string; subject: string; html: string }>;
  /** In-memory records per collection. */
  records: Map<string, StoredRecord[]>;
}

/** Compares like the database does: numbers as numbers, everything else as text. */
function matches(value: unknown, cond: Condition | string | number | boolean | null, numeric: boolean): boolean {
  const norm = (v: unknown) => (v === null || v === undefined || v === "" ? null : numeric ? Number(v) : String(v));
  const c: Condition = cond !== null && typeof cond === "object" ? cond : { eq: cond };
  const v = norm(value);
  const cmp = (x: unknown) => {
    const y = norm(x);
    return v === null || y === null ? NaN : v < y ? -1 : v > y ? 1 : 0;
  };
  if ("eq" in c && v !== norm(c.eq)) return false;
  if ("ne" in c && v === norm(c.ne)) return false;
  if (c.in && !c.in.map(norm).includes(v)) return false;
  if (c.gt !== undefined && !(cmp(c.gt) > 0)) return false;
  if (c.gte !== undefined && !(cmp(c.gte) >= 0)) return false;
  if (c.lt !== undefined && !(cmp(c.lt) < 0)) return false;
  if (c.lte !== undefined && !(cmp(c.lte) <= 0)) return false;
  if (c.startsWith !== undefined && !(typeof v === "string" && v.toLowerCase().startsWith(c.startsWith.toLowerCase()))) return false;
  if (c.contains !== undefined && !(typeof v === "string" && v.toLowerCase().includes(c.contains.toLowerCase()))) return false;
  return true;
}

/** ctx.db backed by memory, with the same field rules as the real one (undeclared fields throw). */
export function memoryPluginDb(manifest: Pick<PluginManifest, "collections">, records = new Map<string, StoredRecord[]>(), userId: string | null = null): PluginDb {
  let seq = 0;
  return {
    collection<T = Record<string, unknown>>(name: string): Collection<T> {
      const spec = collectionSpec(manifest, name);
      const rows = () => {
        if (!records.has(name)) records.set(name, []);
        return records.get(name)!;
      };
      const numeric = (field: string) => spec.columns.get(field)?.startsWith("n") ?? false;
      const filter = (where: RecordWhere = {}) => {
        buildOrder(spec, Object.keys(where)); // throws for fields that can't be filtered
        return rows().filter((r) => Object.entries(where).every(([f, c]) => c === undefined || matches((r as Record<string, unknown>)[f], c as Condition, numeric(f))));
      };
      const stamp = () => new Date(Date.now() + seq++).toISOString();
      const save = (data: unknown, base?: StoredRecord): StoredRecord => {
        const clean = cleanData(data);
        indexColumns(spec, clean); // validates indexed values
        return { ...clean, id: base?.id ?? `rec_${++seq}`, createdAt: base?.createdAt ?? stamp(), updatedAt: stamp(), createdById: base?.createdById ?? userId };
      };
      const indexOf = (id: string) => {
        const i = rows().findIndex((r) => r.id === id);
        if (i < 0) throw new RecordQueryError(`${name} record "${id}" not found`);
        return i;
      };
      const self: Collection<T> = {
        async insert(data) {
          const r = save(data);
          rows().push(r);
          return r as StoredRecord<T>;
        },
        async get(id) {
          return (rows().find((r) => r.id === id) as StoredRecord<T> | undefined) ?? null;
        },
        async update(id, patch) {
          const i = indexOf(id);
          rows()[i] = save({ ...rows()[i], ...cleanData(patch) }, rows()[i]);
          return rows()[i] as StoredRecord<T>;
        },
        async replace(id, data) {
          const i = indexOf(id);
          rows()[i] = save(data, rows()[i]);
          return rows()[i] as StoredRecord<T>;
        },
        async delete(id) {
          const before = rows().length;
          records.set(name, rows().filter((r) => r.id !== id));
          return rows().length < before;
        },
        async deleteMany(where) {
          if (!where || !Object.keys(where).length) throw new RecordQueryError("deleteMany needs a filter");
          const gone = new Set(filter(where).map((r) => r.id));
          records.set(name, rows().filter((r) => !gone.has(r.id)));
          return gone.size;
        },
        async find(opts = {}) {
          buildOrder(spec, opts.orderBy); // validates
          const list = Array.isArray(opts.orderBy) ? opts.orderBy : opts.orderBy ? [opts.orderBy] : [];
          const fields = list.map((o) => (typeof o === "string" ? { field: o.replace(/^-/, ""), dir: o.startsWith("-") ? -1 : 1 } : { field: o.field, dir: o.dir === "desc" ? -1 : 1 }));
          if (!fields.length) fields.push({ field: "createdAt", dir: -1 });
          const sorted = [...filter(opts.where)].sort((a, b) => {
            for (const { field, dir } of fields) {
              const x = (a as Record<string, unknown>)[field];
              const y = (b as Record<string, unknown>)[field];
              const nx = numeric(field) ? Number(x ?? -Infinity) : String(x ?? "");
              const ny = numeric(field) ? Number(y ?? -Infinity) : String(y ?? "");
              if (nx < ny) return -dir;
              if (nx > ny) return dir;
            }
            return 0;
          });
          const offset = Math.max(0, Math.floor(opts.offset ?? 0));
          return sorted.slice(offset, offset + clampFindLimit(opts.limit)) as Array<StoredRecord<T>>;
        },
        async findOne(where) {
          return (await self.find({ where, limit: 1 }))[0] ?? null;
        },
        async count(where) {
          return filter(where).length;
        },
        async sum(field, where) {
          if (!numeric(field)) throw new RecordQueryError(`sum("${field}"): add it to numbers of collection "${name}"`);
          return filter(where).reduce((t, r) => t + Number((r as Record<string, unknown>)[field] ?? 0), 0);
        },
      };
      return self;
    },
  };
}

/** A PluginContext with in-memory storage, captured logs and http, and data methods you can stub. */
export function createPluginTestContext(opts: {
  manifest: PluginManifest;
  settings?: Record<string, SettingValue>;
  companyId?: string;
  data?: Partial<{ [K in keyof PluginDataApi]: Partial<PluginDataApi[K]> }>;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** A signed-in user (default: none, i.e. the background, where ctx.can() is always true). */
  user?: { id: string; name: string; email: string };
  role?: PluginContext["role"];
  /** Capabilities the user holds (default: all). */
  capabilities?: string[];
}): TestContext {
  const logs: TestContext["logs"] = [];
  const store = new Map<string, unknown>();
  const requests: TestContext["requests"] = [];
  const mails: TestContext["mails"] = [];
  const records: TestContext["records"] = new Map();
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
    user: opts.user ?? null,
    role: opts.role ?? null,
    can: (cap) => !opts.user || !opts.capabilities || opts.capabilities.includes(cap),
    settings: { ...defaults, ...opts.settings },
    db: memoryPluginDb(opts.manifest, records, opts.user?.id ?? null),
    mail: {
      send: async (m) => {
        mails.push(m);
        return { sent: (m.toUserIds?.length ?? 0) + (m.toPartyId ? 1 : 0) };
      },
    },
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
      members: opts.data?.members ?? (missing("members") as PluginDataApi["members"]),
      documents: stub("documents", opts.data?.documents, ["list", "get", "setCustomField", "createQuotation"]),
      parties: stub("parties", opts.data?.parties, ["list", "upsert", "get"]),
      products: stub("products", opts.data?.products, ["list", "get", "setCustomField"]),
      payments: stub("payments", opts.data?.payments, ["receivables", "list"]),
      purchases: stub("purchases", opts.data?.purchases, ["list", "get"]),
      purchaseOrders: stub("purchaseOrders", opts.data?.purchaseOrders, ["list", "get"]),
    } as PluginDataApi,
    http: {
      fetch: async (url, init) => {
        requests.push({ url, init });
        return opts.fetch ? opts.fetch(url, init) : new Response("ok", { status: 200 });
      },
    },
    appUrl: (path) => `https://mygst.test${path.startsWith("/") ? path : `/${path}`}`,
    pageUrl: (slug, ...path) => [`/c/${companyId}/apps/${opts.manifest.id}`, ...(slug ? [slug] : []), ...path.map((x) => encodeURIComponent(String(x)))].join("/"),
    companyUrl: (path) => `/c/${companyId}/${path.replace(/^\/+/, "")}`,
    actionUrl: (name) => `/api/plugins/${opts.manifest.id}/_action/${name}?companyId=${companyId}`,
    logs,
    store,
    requests,
    mails,
    records,
  };
}
