import type { ReactNode } from "react";
import type { BuiltinRoleKey as Role } from "@/lib/permissions";
import { UserError } from "../user-error";
import type { ManifestInput, PluginEvent, PluginFilter } from "./manifest";
import type { PluginDb } from "./records";

/**
 * MyGST plugin SDK — the only module a code plugin should import from MyGST (plus React/zod).
 * Guide: docs/plugins/README.md
 *
 *   import { definePlugin } from "@/lib/plugins/sdk";
 *   export default definePlugin({
 *     manifest: { id: "hello", name: "Hello", version: "1.0.0", events: ["invoice.issued"], permissions: ["documents:read"] },
 *     setup(api) {
 *       api.on("invoice.issued", async (event, ctx) => ctx.log.info(`Invoice ${event.data.number}`));
 *     },
 *   });
 */

/** Throw from a filter (e.g. document.validate) or an action to show this message to the user. */
export { UserError as PluginError };

export type { PluginEvent, PluginFilter, PluginPermission } from "./manifest";
export type { Collection, FindOptions, PluginDb, StoredRecord } from "./records";
export type { Condition, RecordOrder, RecordWhere } from "./record-query";

/** UI kit: MyGST's components for plugin pages and widgets (server-rendered). */
export * from "./ui-kit";

export type SettingValue = string | number | boolean;

export interface PluginCompany {
  id: string;
  legalName: string;
  tradeName: string;
  gstin: string;
  stateCode: string;
}

/** Everything a plugin handler gets. All data access is scoped to `companyId` and the plugin's permissions. */
export interface PluginContext {
  pluginId: string;
  companyId: string;
  company: PluginCompany;
  /** The signed-in user for pages, widgets, routes, actions and filters; null for events and jobs (background). */
  user: { id: string; name: string; email: string } | null;
  /** The user's highest built-in role (null for custom roles only, and in the background). */
  role: Role | null;
  /**
   * Does the user hold one of this plugin's capabilities (manifest `capabilities`)? Owners always do.
   * In events and jobs (no user) the plugin acts by itself and this is true.
   */
  can(capability: string): boolean;
  /** This company's settings for the plugin (secrets decrypted). */
  settings: Record<string, SettingValue>;
  /** Small key-value storage (64 KB per value). For real data use `db`. */
  storage: PluginStorage;
  /** Data tables declared in manifest.collections: ctx.db.collection("leads").find({ where: { stage: "won" } }). */
  db: PluginDb;
  log: PluginLogger;
  data: PluginDataApi;
  /** Emails (needs "mail:send"): only to company members or to a customer/supplier of this company. 100 a day. */
  mail: PluginMail;
  /** fetch() with a 10 s timeout that refuses private/loopback addresses in production. */
  http: { fetch(url: string, init?: RequestInit): Promise<Response> };
  /** Absolute URL in MyGST, e.g. appUrl("/c/<id>/invoices"). */
  appUrl(path: string): string;
  /** Path of one of this plugin's pages: pageUrl("leads", id) → /c/<company>/apps/<plugin>/leads/<id>. */
  pageUrl(slug?: string, ...path: Array<string | number>): string;
  /** Path of a company page: companyUrl("quotations/new") → /c/<company>/quotations/new. */
  companyUrl(path: string): string;
  /** Where an <ActionForm> posts to run api.action(name). */
  actionUrl(name: string): string;
}

export interface PluginMail {
  send(input: {
    /** Company members (user ids). */
    toUserIds?: string[];
    /** A customer or supplier of this company (their saved email). */
    toPartyId?: string;
    subject: string;
    html: string;
  }): Promise<{ sent: number }>;
}

export interface CompanyMember {
  userId: string;
  name: string;
  email: string;
  roles: string[];
}

export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<Array<{ key: string; value: unknown }>>;
}

export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface DocumentSummary {
  id: string;
  type: "INVOICE" | "QUOTATION" | "CREDIT_NOTE" | "DEBIT_NOTE";
  number: string;
  date: string;
  status: string;
  partyId: string;
  partyName: string;
  partyGstin: string;
  /** Rupees. */
  total: number;
  customFields: Record<string, CustomField>;
}

export interface CustomField {
  label: string;
  value: string;
  /** Print on the invoice PDF. */
  onPdf?: boolean;
}

/** Scoped data access. Each method checks the plugin's declared permission (throws if missing). */
export interface LineItem {
  productId: string | null;
  description: string;
  hsnSac: string;
  qty: number;
  unit: string;
  /** Rupees. */
  rate: number;
  gstRate: number;
  /** Rupees. */
  taxable: number;
}

export interface PartyDetail {
  id: string;
  name: string;
  type: string;
  gstin: string;
  phone: string;
  email: string;
  stateCode: string;
  address: string;
  city: string;
  customFields: Record<string, unknown>;
}

export interface ProductDetail {
  id: string;
  name: string;
  hsnSac: string;
  isService: boolean;
  unit: string;
  salePrice: number;
  purchasePrice: number;
  gstRate: number;
  active: boolean;
  customFields: Record<string, CustomField>;
}

export interface PurchaseDetail {
  id: string;
  billNo: string;
  date: string;
  supplierId: string;
  supplierName: string;
  supplierGstin: string;
  cancelled: boolean;
  purchaseOrderId: string | null;
  /** Rupees. */
  total: number;
  items: LineItem[];
}

export interface PurchaseOrderDetail {
  id: string;
  number: string;
  date: string;
  expectedDate: string;
  status: string;
  supplierId: string;
  supplierName: string;
  /** Rupees. */
  total: number;
  items: Array<LineItem & { id: string; billedQty: number; remaining: number }>;
}

export interface PluginDataApi {
  company(): Promise<PluginCompany & { address: string; city: string; pincode: string; phone: string; email: string }>; // company:read
  /** People in this company (to assign work, send mail…). */
  members(): Promise<CompanyMember[]>; // company:read
  documents: {
    list(opts?: { type?: DocumentSummary["type"]; from?: string; to?: string; partyId?: string; limit?: number }): Promise<DocumentSummary[]>; // documents:read
    get(id: string): Promise<Record<string, unknown> | null>; // documents:read — full document incl. items (money in paise)
    setCustomField(id: string, key: string, field: CustomField | null): Promise<void>; // documents:write
    createQuotation(input: unknown): Promise<{ id: string; number: string; url: string; total: number }>; // documents:write (same body as POST /api/v1/quotations)
  };
  parties: {
    list(opts?: { search?: string; limit?: number }): Promise<Array<{ id: string; name: string; type: string; gstin: string; phone: string; email: string; stateCode: string }>>; // parties:read
    upsert(input: unknown): Promise<{ id: string; created: boolean }>; // parties:write (same body as POST /api/v1/parties/upsert)
    get(id: string): Promise<PartyDetail | null>; // parties:read
  };
  products: {
    list(opts?: { search?: string; limit?: number }): Promise<Array<{ id: string; name: string; hsnSac: string; salePrice: number; gstRate: number }>>; // products:read
    get(id: string): Promise<ProductDetail | null>; // products:read
    /** Shown on the product page, e.g. { label: "Stock on hand", value: "42 NOS" }. null removes it. */
    setCustomField(id: string, key: string, field: Omit<CustomField, "onPdf"> | null): Promise<void>; // products:write
  };
  payments: {
    /** Open invoices/debit notes with their outstanding balance (rupees), oldest first. */
    receivables(partyId?: string): Promise<Array<{ id: string; kind: string; number: string; date: string; dueDate: string; total: number; balance: number }>>; // payments:read
    list(opts?: { from?: string; to?: string; partyId?: string; limit?: number }): Promise<Array<{ id: string; direction: string; number: string; date: string; partyId: string; partyName: string; amount: number; mode: string }>>; // payments:read
  };
  purchases: {
    list(opts?: { from?: string; to?: string; limit?: number }): Promise<Array<{ id: string; billNo: string; date: string; supplierName: string; total: number }>>; // purchases:read
    get(id: string): Promise<PurchaseDetail | null>; // purchases:read
  };
  purchaseOrders: {
    list(opts?: { status?: string; from?: string; to?: string; limit?: number }): Promise<Array<{ id: string; number: string; date: string; status: string; supplierName: string; total: number }>>; // purchaseOrders:read
    get(id: string): Promise<PurchaseOrderDetail | null>; // purchaseOrders:read
  };
}

// ───────────────────────── Hook payloads ─────────────────────────

export interface PluginEventEnvelope<T = Record<string, unknown>> {
  id: string;
  type: PluginEvent;
  occurredAt: string;
  companyId: string;
  data: T;
}

export interface DocumentHookArgs {
  type: DocumentSummary["type"];
  /** null when creating. */
  documentId: string | null;
  input: {
    partyId: string;
    date: string;
    dueDate?: string | null;
    placeOfSupply: string;
    notes?: string | null;
    items: Array<{ description: string; hsnSac?: string; qty: number; rate: number; gstRate: number }>;
  };
  party: { id: string; name: string; gstin: string; stateCode: string; customFields: Record<string, unknown> };
}

export interface BeforeSaveValue {
  notes: string;
  customFields: Record<string, CustomField>;
}

export interface PdfSection {
  title?: string;
  lines: string[];
}

export interface LinkItem {
  label: string;
  /** Path inside the company (e.g. "apps/my-plugin/report") or an absolute https URL. */
  href: string;
  description?: string;
}

export interface FilterMap {
  /** Throw PluginError to block the save. Return value ignored. */
  "document.validate": { value: void; args: DocumentHookArgs };
  "document.beforeSave": { value: BeforeSaveValue; args: DocumentHookArgs };
  "pdf.sections": { value: PdfSection[]; args: { document: DocumentSummary } };
  "document.actions": { value: LinkItem[]; args: { document: DocumentSummary } };
  "reports.list": { value: LinkItem[]; args: Record<string, never> };
  "nav.items": { value: LinkItem[]; args: Record<string, never> };
}

export type ActionHandler = (event: PluginEventEnvelope, ctx: PluginContext) => Promise<void> | void;

/** What a form action returns: where to go next and the message to show there. */
export interface FormActionResult {
  /** A path inside the company (e.g. ctx.pageUrl("leads", id)); default: the form's page. */
  redirect?: string;
  message?: string;
}
/** Handles an <ActionForm> post. Throw PluginError("…") to show an error message instead. */
export type FormActionHandler = (form: FormData, ctx: PluginContext) => FormActionResult | void | Promise<FormActionResult | void>;
/** A scheduled job (manifest.jobs), run once per period for each company where the plugin is active. */
export type JobHandler = (ctx: PluginContext) => Promise<void> | void;
export type FilterHandler<F extends PluginFilter> = (value: FilterMap[F]["value"], args: FilterMap[F]["args"], ctx: PluginContext) => FilterMap[F]["value"] | Promise<FilterMap[F]["value"]>;

export interface PageProps {
  ctx: PluginContext;
  /** Path segments after /apps/<plugin>/<slug>/ */
  path: string[];
  searchParams: Record<string, string | string[] | undefined>;
}
export type PageComponent = (props: PageProps) => ReactNode | Promise<ReactNode>;
export type WidgetComponent = (props: { ctx: PluginContext }) => ReactNode | Promise<ReactNode>;

export type RouteHandler = (
  request: Request,
  helpers: {
    /** Signed-in user's context (null for public routes). */
    ctx: PluginContext | null;
    /** Path segments after /api/plugins/<plugin>/ */
    path: string[];
    /** Public routes: context for a company where this plugin is active (null otherwise). */
    contextFor(companyId: string): Promise<PluginContext | null>;
  },
) => Response | Promise<Response>;

export interface LifecycleHandlers {
  /** Platform-wide, when the super admin installs / uninstalls (no company). */
  onInstall?: () => Promise<void> | void;
  onUninstall?: () => Promise<void> | void;
  /** Per company, when the plugin becomes active / inactive there. */
  onEnable?: (ctx: PluginContext) => Promise<void> | void;
  onDisable?: (ctx: PluginContext) => Promise<void> | void;
}

export interface PluginApi {
  on(event: PluginEvent, handler: ActionHandler, opts?: { priority?: number }): void;
  filter<F extends PluginFilter>(name: F, handler: FilterHandler<F>, opts?: { priority?: number }): void;
  page(slug: string, component: PageComponent): void;
  widget(id: string, component: WidgetComponent): void;
  /** Extra settings UI shown under the generated settings form. */
  settingsPage(component: PageComponent): void;
  route(method: "GET" | "POST" | "PUT" | "DELETE", path: string, handler: RouteHandler, opts?: { public?: boolean; roles?: Role[]; permission?: string }): void;
  /** A form handler for <ActionForm action="name">. `permission`: a capability the user must hold. */
  action(name: string, handler: FormActionHandler, opts?: { permission?: string }): void;
  /** Runs a job declared in manifest.jobs (hourly / daily after 06:00 IST) for each active company. */
  schedule(jobId: string, handler: JobHandler): void;
  lifecycle(handlers: LifecycleHandlers): void;
}

export interface PluginDefinition {
  manifest: ManifestInput;
  setup(api: PluginApi): void;
}

/** Declares a code plugin (default export of src/plugins/<id>/index.ts). */
export function definePlugin(def: PluginDefinition): PluginDefinition {
  return def;
}
