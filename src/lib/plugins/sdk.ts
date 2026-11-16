import type { ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import { UserError } from "../user-error";
import type { ManifestInput, PluginEvent, PluginFilter } from "./manifest";

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

/** Throw from a filter (e.g. document.validate) to show this message to the user and stop the save. */
export { UserError as PluginError };

export type { PluginEvent, PluginFilter, PluginPermission } from "./manifest";

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
  /** The signed-in user for pages, widgets, routes and filters; null for events (background). */
  user: { id: string; name: string; email: string } | null;
  role: Role | null;
  /** This company's settings for the plugin (secrets decrypted). */
  settings: Record<string, SettingValue>;
  storage: PluginStorage;
  log: PluginLogger;
  data: PluginDataApi;
  /** fetch() with a 10 s timeout that refuses private/loopback addresses in production. */
  http: { fetch(url: string, init?: RequestInit): Promise<Response> };
  /** Absolute URL in MyGST, e.g. appUrl("/c/<id>/invoices"). */
  appUrl(path: string): string;
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
export interface PluginDataApi {
  company(): Promise<PluginCompany & { address: string; city: string; pincode: string; phone: string; email: string }>; // company:read
  documents: {
    list(opts?: { type?: DocumentSummary["type"]; from?: string; to?: string; partyId?: string; limit?: number }): Promise<DocumentSummary[]>; // documents:read
    get(id: string): Promise<Record<string, unknown> | null>; // documents:read — full document incl. items (money in paise)
    setCustomField(id: string, key: string, field: CustomField | null): Promise<void>; // documents:write
    createQuotation(input: unknown): Promise<{ id: string; number: string; url: string; total: number }>; // documents:write (same body as POST /api/v1/quotations)
  };
  parties: {
    list(opts?: { search?: string; limit?: number }): Promise<Array<{ id: string; name: string; type: string; gstin: string; phone: string; email: string; stateCode: string }>>; // parties:read
    upsert(input: unknown): Promise<{ id: string; created: boolean }>; // parties:write (same body as POST /api/v1/parties/upsert)
  };
  products: { list(opts?: { search?: string; limit?: number }): Promise<Array<{ id: string; name: string; hsnSac: string; salePrice: number; gstRate: number }>> }; // products:read
  /** Open invoices/debit notes with their outstanding balance (rupees), oldest first. */
  payments: { receivables(partyId?: string): Promise<Array<{ id: string; kind: string; number: string; date: string; dueDate: string; total: number; balance: number }>> }; // payments:read
  purchases: { list(opts?: { from?: string; to?: string; limit?: number }): Promise<Array<{ id: string; billNo: string; date: string; supplierName: string; total: number }>> }; // purchases:read
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
  route(method: "GET" | "POST" | "PUT" | "DELETE", path: string, handler: RouteHandler, opts?: { public?: boolean; roles?: Role[] }): void;
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
