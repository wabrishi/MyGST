import { z } from "zod";

/**
 * The plugin manifest — one shape for code plugins (src/plugins/<id>/index.ts) and external plugins
 * (manifest.json served over https). Pure module: no database, unit-tested directly.
 * Reference: docs/plugins/README.md#manifest
 */

export const PLUGIN_PERMISSIONS = {
  "company:read": "Read company details (name, GSTIN, address)",
  "documents:read": "Read invoices, quotations and notes",
  "documents:write": "Create quotations and add custom fields to documents",
  "parties:read": "Read customers and suppliers",
  "parties:write": "Create and update customers and suppliers",
  "products:read": "Read products and services",
  "payments:read": "Read payments and outstanding balances",
  "products:write": "Add custom fields to products (e.g. stock on hand)",
  "purchases:read": "Read purchase invoices",
  "purchaseOrders:read": "Read purchase orders",
  "reports:read": "Read GST reports and dashboards",
  "mail:send": "Send emails to company members and to customers/suppliers",
} as const;
export type PluginPermission = keyof typeof PLUGIN_PERMISSIONS;
const permissionKeys = Object.keys(PLUGIN_PERMISSIONS) as [PluginPermission, ...PluginPermission[]];

/** Action hooks (async, after the change is committed). */
export const PLUGIN_EVENTS = {
  "invoice.issued": "An invoice was created",
  "invoice.cancelled": "An invoice was cancelled",
  "document.updated": "An invoice, quotation or note was edited",
  "quotation.created": "A quotation was created",
  "quotation.converted": "A quotation was converted to an invoice",
  "credit_note.issued": "A credit note was created",
  "debit_note.issued": "A debit note was created",
  "payment.received": "A payment was received from a customer",
  "payment.paid": "A payment was made to a supplier",
  "purchase.saved": "A purchase invoice was created or edited",
  "purchase.cancelled": "A purchase invoice was cancelled",
  "purchase_order.saved": "A purchase order was created or edited",
  "purchase_order.cancelled": "A purchase order was cancelled",
  "party.saved": "A customer or supplier was created or edited",
  "product.saved": "A product was created or edited",
  "company.updated": "Company settings were changed",
} as const;
export type PluginEvent = keyof typeof PLUGIN_EVENTS;
const eventKeys = Object.keys(PLUGIN_EVENTS) as [PluginEvent, ...PluginEvent[]];

/** Which permission a plugin needs to receive each event (events carry that kind of data). */
export const EVENT_PERMISSION: Record<PluginEvent, PluginPermission> = {
  "invoice.issued": "documents:read",
  "invoice.cancelled": "documents:read",
  "document.updated": "documents:read",
  "quotation.created": "documents:read",
  "quotation.converted": "documents:read",
  "credit_note.issued": "documents:read",
  "debit_note.issued": "documents:read",
  "payment.received": "payments:read",
  "payment.paid": "payments:read",
  "purchase.saved": "purchases:read",
  "purchase.cancelled": "purchases:read",
  "purchase_order.saved": "purchaseOrders:read",
  "purchase_order.cancelled": "purchaseOrders:read",
  "party.saved": "parties:read",
  "product.saved": "products:read",
  "company.updated": "company:read",
};

/** Filter hooks (sync, in the request, return the modified value). */
export const PLUGIN_FILTERS = ["document.validate", "document.beforeSave", "pdf.sections", "document.actions", "reports.list", "nav.items"] as const;
export type PluginFilter = (typeof PLUGIN_FILTERS)[number];

export const ROLES = ["OWNER", "ACCOUNTANT", "STAFF"] as const;

const slug = z.string().regex(/^[a-z][a-z0-9-]{1,40}[a-z0-9]$/, "Use 3–42 lowercase letters, digits and dashes, starting with a letter");
const semver = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, "Use a semantic version like 1.0.0");

/** https URL (http only for localhost outside production). */
export const pluginUrl = z
  .string()
  .max(1000)
  .refine((raw) => {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:") return true;
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
      return u.protocol === "http:" && local && process.env.NODE_ENV !== "production";
    } catch {
      return false;
    }
  }, "Must be an https:// URL");

const settingField = z
  .object({
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/, "Setting keys are letters, digits and _"),
    label: z.string().min(1).max(80),
    type: z.enum(["text", "textarea", "number", "boolean", "select", "secret", "url"]),
    help: z.string().max(300).optional(),
    required: z.boolean().optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).max(50).optional(),
  })
  .refine((f) => f.type !== "select" || (f.options?.length ?? 0) > 0, { message: "select settings need options" });

const roles = z.array(z.enum(ROLES)).min(1).default(["OWNER", "ACCOUNTANT", "STAFF"]);
const fieldName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/, "Field names are letters, digits and _");
/** A plugin-defined permission key, e.g. "leads.manage". */
const capabilityKey = z.string().regex(/^[a-z][a-zA-Z0-9_]*(?:\.[a-z][a-zA-Z0-9_]*){0,2}$/, 'Capability keys look like "leads.manage"').max(60);

/** Limits for plugin data tables (see records.ts). */
export const MAX_STRING_INDEXES = 4;
export const MAX_NUMBER_FIELDS = 2;

const collection = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/, "Collection names are lowercase letters, digits and _"),
  /** Text fields you filter or sort on (stored in indexed columns, max 191 characters each). */
  indexes: z.array(fieldName).max(MAX_STRING_INDEXES).default([]),
  /** Number fields you filter, sort or sum on. */
  numbers: z.array(fieldName).max(MAX_NUMBER_FIELDS).default([]),
});

export const manifestSchema = z.object({
  id: slug,
  name: z.string().min(2).max(60),
  version: semver,
  description: z.string().max(500).default(""),
  author: z.string().max(100).default(""),
  homepage: z.string().max(300).optional(),
  /** A lucide icon name (e.g. "MessageSquare") for menus. */
  icon: z.string().max(40).default("Puzzle"),
  minAppVersion: semver.optional(),
  permissions: z.array(z.enum(permissionKeys)).max(20).default([]),
  settings: z.array(settingField).max(30).default([]),
  events: z.array(z.enum(eventKeys)).max(30).default([]),
  filters: z.array(z.enum(PLUGIN_FILTERS)).max(10).default([]),
  pages: z
    .array(
      z.object({
        slug,
        title: z.string().min(1).max(40),
        icon: z.string().max(40).optional(),
        roles,
        inNav: z.boolean().default(true),
        /** A capability (see `capabilities`) needed to open the page. */
        permission: capabilityKey.optional(),
      }),
    )
    .max(20)
    .default([]),
  widgets: z
    .array(z.object({ id: slug, title: z.string().min(1).max(60), roles, width: z.enum(["third", "half", "full"]).default("third"), permission: capabilityKey.optional() }))
    .max(5)
    .default([]),
  /** Plugin data tables: records per company with indexed fields (ctx.db.collection(name)). */
  collections: z.array(collection).max(10).default([]),
  /**
   * The plugin's own permissions. They appear in Settings → Roles; `roles` are the built-in roles that
   * hold them by default (owners always do). Check with ctx.can(key) or a page/action `permission`.
   */
  capabilities: z.array(z.object({ key: capabilityKey, label: z.string().min(1).max(80), roles: z.array(z.enum(ROLES)).default(["OWNER"]) })).max(30).default([]),
  /** Scheduled jobs (api.schedule) run by the cron tick for every company where the plugin is active. */
  jobs: z.array(z.object({ id: slug, every: z.enum(["hourly", "daily"]), title: z.string().max(80).optional() })).max(10).default([]),
  // ── External plugins only ──
  /** Receives lifecycle + subscribed events (signed POSTs). */
  webhookUrl: pluginUrl.optional(),
  /** Pages and widgets are framed from here: <pageBaseUrl>/<slug>?mygst_token=… */
  pageBaseUrl: pluginUrl.optional(),
  /** Optional synchronous validation before a document is saved (3 s timeout, fail-open). */
  validateUrl: pluginUrl.optional(),
});

export type PluginManifest = z.output<typeof manifestSchema>;
export type ManifestInput = z.input<typeof manifestSchema>;
export type SettingField = PluginManifest["settings"][number];

/** Parses a manifest, adding cross-field rules. Throws ZodError with readable messages. */
export function parseManifest(raw: unknown, kind: "CODE" | "EXTERNAL"): PluginManifest {
  const m = manifestSchema.parse(raw);
  const problems: string[] = [];
  for (const ev of m.events) {
    if (!m.permissions.includes(EVENT_PERMISSION[ev])) problems.push(`event "${ev}" needs the "${EVENT_PERMISSION[ev]}" permission`);
  }
  if (kind === "EXTERNAL") {
    if (m.events.length && !m.webhookUrl) problems.push("webhookUrl is required to receive events");
    if ((m.pages.length || m.widgets.length) && !m.pageBaseUrl) problems.push("pageBaseUrl is required for pages and widgets");
    const unsupported = m.filters.filter((f) => f !== "document.validate");
    if (unsupported.length) problems.push(`external plugins can only use the "document.validate" filter (not ${unsupported.join(", ")})`);
    if (m.filters.includes("document.validate") && !m.validateUrl) problems.push("validateUrl is required for document.validate");
  } else if (m.webhookUrl || m.pageBaseUrl || m.validateUrl) {
    problems.push("webhookUrl, pageBaseUrl and validateUrl are for external plugins only");
  }
  const keys = m.settings.map((s) => s.key);
  if (new Set(keys).size !== keys.length) problems.push("setting keys must be unique");
  const unique = (what: string, list: string[]) => {
    if (new Set(list).size !== list.length) problems.push(`${what} must be unique`);
  };
  unique("page slugs", m.pages.map((p) => p.slug));
  unique("collection names", m.collections.map((c) => c.name));
  unique("capability keys", m.capabilities.map((c) => c.key));
  unique("job ids", m.jobs.map((j) => j.id));
  for (const c of m.collections) unique(`fields of collection "${c.name}"`, [...c.indexes, ...c.numbers]);
  const caps = new Set(m.capabilities.map((c) => c.key));
  for (const x of [...m.pages, ...m.widgets]) {
    if (x.permission && !caps.has(x.permission)) problems.push(`permission "${x.permission}" is not declared in capabilities`);
  }
  if (kind === "EXTERNAL" && (m.collections.length || m.jobs.length)) problems.push("collections and jobs are for code plugins only");
  if (problems.length) {
    throw new z.ZodError(problems.map((message) => ({ code: "custom", message, path: [], input: raw })));
  }
  return m;
}

/** "1.2.10" >= "1.2.9" */
export function semverGte(a: string, b: string) {
  const pa = a.split(/[-+]/)[0].split(".").map(Number);
  const pb = b.split(/[-+]/)[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  return true;
}

/** Permissions added by an upgrade (the owner must accept them again). */
export const newPermissions = (accepted: readonly string[] | null | undefined, wanted: readonly string[]) =>
  wanted.filter((p) => !(accepted ?? []).includes(p));
