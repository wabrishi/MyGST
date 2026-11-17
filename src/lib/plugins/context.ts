import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { BUILTIN_ROLE_ID, type BuiltinRoleKey as Role } from "../permissions";
import { db } from "../db";
import { absoluteUrl } from "../events/outbox";
import { memberGrants, ROLES_SELECT, type CompanyContext } from "../tenant";
import { pluginLog } from "./log";
import type { PluginManifest, PluginPermission } from "./manifest";
import { safeFetch } from "./net";
import type { CustomField, DocumentSummary, PluginContext, PluginDataApi, PluginStorage } from "./sdk";
import { readSettings } from "./settings";

/**
 * Builds the `ctx` handed to plugin code. Every data method is scoped to the company and checks the
 * plugin's declared permissions — plugins never see a raw database client.
 * Core modules are imported lazily inside methods (documents.ts → plugin hooks → context → documents.ts).
 */
export class PluginPermissionError extends Error {}

const STORAGE_KEY = /^[\w.:/-]{1,191}$/;
const rupees = (paise: number) => Math.round(paise) / 100;
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const clampLimit = (n: number | undefined, max = 200) => Math.min(Math.max(1, Math.floor(n ?? 50)), max);

export interface ContextInput {
  pluginId: string;
  manifest: PluginManifest;
  companyId: string;
  settings: unknown;
  user?: { id: string; name: string; email: string } | null;
  role?: Role | null;
  /** Used when a plugin acts without a signed-in user (events): who the action is attributed to. */
  actingUserId?: string | null;
}

export async function buildPluginContext(input: ContextInput): Promise<PluginContext> {
  const { pluginId, manifest, companyId } = input;
  const company = await db.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { id: true, legalName: true, tradeName: true, gstin: true, stateCode: true, address: true, city: true, pincode: true, phone: true, email: true },
  });

  const need = (perm: PluginPermission) => {
    if (!manifest.permissions.includes(perm)) throw new PluginPermissionError(`Plugin "${pluginId}" needs the "${perm}" permission for this (add it to manifest.permissions)`);
  };

  const storage: PluginStorage = {
    async get<T>(key: string) {
      const row = await db.pluginData.findUnique({ where: { pluginId_companyId_key: { pluginId, companyId, key } } });
      return (row?.value ?? null) as T | null;
    },
    async set(key, value) {
      if (!STORAGE_KEY.test(key)) throw new Error("Storage keys are 1–191 characters: letters, digits and . : / _ -");
      const json = JSON.stringify(value ?? null);
      if (json.length > 64_000) throw new Error("Storage values are limited to 64 KB");
      const v = JSON.parse(json) as Prisma.InputJsonValue;
      await db.pluginData.upsert({ where: { pluginId_companyId_key: { pluginId, companyId, key } }, create: { pluginId, companyId, key, value: v }, update: { value: v } });
    },
    async delete(key) {
      await db.pluginData.deleteMany({ where: { pluginId, companyId, key } });
    },
    async list(prefix = "") {
      const rows = await db.pluginData.findMany({ where: { pluginId, companyId, key: { startsWith: prefix } }, orderBy: { key: "asc" }, take: 500 });
      return rows.map((r) => ({ key: r.key, value: r.value }));
    },
  };

  // Plugins acting in the background are attributed to the owner who enabled them (else any owner).
  const actingContext = async (): Promise<CompanyContext> => {
    const userId =
      input.user?.id ??
      input.actingUserId ??
      (await db.membership.findFirst({ where: { companyId, roles: { some: { roleId: BUILTIN_ROLE_ID.OWNER } } }, orderBy: { createdAt: "asc" }, select: { userId: true } }))?.userId;
    if (!userId) throw new Error("No owner to act as");
    const m = await db.membership.findUnique({ where: { userId_companyId: { userId, companyId } }, include: { user: { select: { id: true, name: true, email: true } }, ...ROLES_SELECT } });
    if (!m) throw new Error("The acting user is no longer a member of this company");
    return { user: m.user, companyId, membershipId: m.id, ...memberGrants(m.roles), company: { id: company.id, legalName: company.legalName, tradeName: company.tradeName, stateCode: company.stateCode, gstin: company.gstin } };
  };

  const summary = (d: {
    id: string;
    type: DocumentSummary["type"];
    number: string;
    date: Date;
    status: string;
    partyId: string;
    partyName: string;
    partyGstin: string;
    grandTotal: { toNumber(): number };
    customFields: unknown;
  }): DocumentSummary => ({
    id: d.id,
    type: d.type,
    number: d.number,
    date: iso(d.date),
    status: d.status,
    partyId: d.partyId,
    partyName: d.partyName,
    partyGstin: d.partyGstin,
    total: d.grandTotal.toNumber(),
    customFields: (d.customFields ?? {}) as Record<string, CustomField>,
  });

  const data: PluginDataApi = {
    async company() {
      need("company:read");
      return company;
    },
    documents: {
      async list(opts = {}) {
        need("documents:read");
        const rows = await db.document.findMany({
          where: {
            companyId,
            ...(opts.type && { type: opts.type }),
            ...(opts.partyId && { partyId: opts.partyId }),
            ...((opts.from || opts.to) && { date: { ...(opts.from && { gte: new Date(opts.from) }), ...(opts.to && { lte: new Date(opts.to) }) } }),
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: clampLimit(opts.limit),
        });
        return rows.map(summary);
      },
      async get(id) {
        need("documents:read");
        const { loadDocument } = await import("../documents");
        const d = await loadDocument(companyId, id);
        return d ? (JSON.parse(JSON.stringify(d)) as Record<string, unknown>) : null;
      },
      async setCustomField(id, key, field) {
        need("documents:write");
        const fullKey = `${pluginId}.${key}`;
        const doc = await db.document.findFirst({ where: { id, companyId }, select: { id: true, customFields: true } });
        if (!doc) throw new Error("Document not found");
        const fields = { ...((doc.customFields ?? {}) as unknown as Record<string, CustomField>) };
        if (field) fields[fullKey] = { label: String(field.label).slice(0, 60), value: String(field.value).slice(0, 300), onPdf: !!field.onPdf };
        else delete fields[fullKey];
        await db.document.update({ where: { id: doc.id }, data: { customFields: fields as unknown as Prisma.InputJsonValue } });
      },
      async createQuotation(body) {
        need("documents:write");
        const { createQuotation } = await import("../api/v1");
        return createQuotation(await actingContext(), body);
      },
    },
    parties: {
      async list(opts = {}) {
        need("parties:read");
        const rows = await db.party.findMany({
          where: { companyId, ...(opts.search && { name: { contains: opts.search } }) },
          orderBy: { name: "asc" },
          take: clampLimit(opts.limit),
          select: { id: true, name: true, type: true, gstin: true, phone: true, email: true, stateCode: true },
        });
        return rows;
      },
      async upsert(body) {
        need("parties:write");
        const { upsertParty } = await import("../api/v1");
        return upsertParty(await actingContext(), body);
      },
    },
    products: {
      async list(opts = {}) {
        need("products:read");
        const rows = await db.product.findMany({
          where: { companyId, active: true, ...(opts.search && { name: { contains: opts.search } }) },
          orderBy: { name: "asc" },
          take: clampLimit(opts.limit),
        });
        return rows.map((p) => ({ id: p.id, name: p.name, hsnSac: p.hsnSac, salePrice: p.salePrice.toNumber(), gstRate: p.gstRate.toNumber() }));
      },
    },
    payments: {
      async receivables(partyId) {
        need("payments:read");
        const { openReceivables } = await import("../payments");
        const items = await openReceivables(db, companyId, partyId);
        return items.map((i) => ({ id: i.id, kind: i.kind, number: i.number, date: i.date, dueDate: i.dueDate, total: rupees(i.total), balance: rupees(i.balance) }));
      },
    },
    purchases: {
      async list(opts = {}) {
        need("purchases:read");
        const rows = await db.purchaseBill.findMany({
          where: {
            companyId,
            cancelled: false,
            ...((opts.from || opts.to) && { billDate: { ...(opts.from && { gte: new Date(opts.from) }), ...(opts.to && { lte: new Date(opts.to) }) } }),
          },
          orderBy: { billDate: "desc" },
          take: clampLimit(opts.limit),
        });
        return rows.map((b) => ({ id: b.id, billNo: b.billNumber, date: iso(b.billDate), supplierName: b.partyName, total: b.grandTotal.toNumber() }));
      },
    },
  };

  return {
    pluginId,
    companyId,
    company: { id: company.id, legalName: company.legalName, tradeName: company.tradeName, gstin: company.gstin, stateCode: company.stateCode },
    user: input.user ?? null,
    role: input.role ?? null,
    settings: readSettings(manifest.settings, input.settings),
    storage,
    log: {
      info: (m) => void pluginLog(pluginId, companyId, "info", m),
      warn: (m) => void pluginLog(pluginId, companyId, "warn", m),
      error: (m) => void pluginLog(pluginId, companyId, "error", m),
    },
    data,
    http: { fetch: (url, init) => safeFetch(url, init) },
    appUrl: (path) => absoluteUrl(path.startsWith("/") ? path : `/${path}`),
  };
}
