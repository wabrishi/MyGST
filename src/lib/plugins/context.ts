import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { BUILTIN_ROLE_ID, canPlugin, type BuiltinRoleKey as Role } from "../permissions";
import { db } from "../db";
import { absoluteUrl } from "../events/outbox";
import { memberGrants, ROLES_SELECT, type CompanyContext } from "../tenant";
import { pluginLog } from "./log";
import type { PluginManifest, PluginPermission } from "./manifest";
import { safeFetch } from "./net";
import { pluginDb } from "./records";
import type { CustomField, DocumentSummary, LineItem, PluginContext, PluginDataApi, PluginMail, PluginStorage } from "./sdk";
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
  /** The signed-in member's roles and permissions (for ctx.can); omitted in the background. */
  member?: { roles: Array<{ key: string | null }>; permissions: ReadonlySet<string> } | null;
}

/** Emails a plugin may send per company per day. */
export const MAIL_DAILY_LIMIT = 100;

const num = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : 0);
const lineItem = (i: {
  productId: string | null;
  description: string;
  hsnSac: string;
  qty: { toNumber(): number };
  unit: string;
  rate: { toNumber(): number };
  gstRate: { toNumber(): number };
  taxable: { toNumber(): number };
}): LineItem => ({
  productId: i.productId,
  description: i.description,
  hsnSac: i.hsnSac,
  qty: num(i.qty),
  unit: i.unit,
  rate: num(i.rate),
  gstRate: num(i.gstRate),
  taxable: num(i.taxable),
});

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
    type: string;
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
    type: d.type as DocumentSummary["type"], // document rows are always sales types
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
    async members() {
      need("company:read");
      const rows = await db.membership.findMany({
        where: { companyId },
        include: { user: { select: { id: true, name: true, email: true, disabledAt: true } }, roles: { select: { role: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      });
      return rows.filter((m) => !m.user.disabledAt).map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, roles: m.roles.map((r) => r.role.name) }));
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
      async get(id) {
        need("parties:read");
        const p = await db.party.findFirst({ where: { id: String(id), companyId } });
        if (!p) return null;
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          gstin: p.gstin,
          phone: p.phone,
          email: p.email,
          stateCode: p.stateCode,
          address: p.billingAddress,
          city: "",
          customFields: (p.customFields ?? {}) as Record<string, unknown>,
        };
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
      async get(id) {
        need("products:read");
        const p = await db.product.findFirst({ where: { id: String(id), companyId } });
        if (!p) return null;
        return {
          id: p.id,
          name: p.name,
          hsnSac: p.hsnSac,
          isService: p.isService,
          unit: p.unit,
          salePrice: num(p.salePrice),
          purchasePrice: num(p.purchasePrice),
          gstRate: num(p.gstRate),
          active: p.active,
          customFields: (p.customFields ?? {}) as unknown as Record<string, CustomField>,
        };
      },
      async setCustomField(id, key, field) {
        need("products:write");
        if (!/^[a-zA-Z][\w.-]{0,40}$/.test(key)) throw new Error("Custom field keys are letters, digits and . _ -");
        const fullKey = `${pluginId}.${key}`;
        const p = await db.product.findFirst({ where: { id: String(id), companyId }, select: { id: true, customFields: true } });
        if (!p) throw new Error("Product not found");
        const fields = { ...((p.customFields ?? {}) as unknown as Record<string, CustomField>) };
        if (field) fields[fullKey] = { label: String(field.label).slice(0, 60), value: String(field.value).slice(0, 300) };
        else delete fields[fullKey];
        await db.product.update({ where: { id: p.id }, data: { customFields: fields as unknown as Prisma.InputJsonValue } });
      },
    },
    payments: {
      async receivables(partyId) {
        need("payments:read");
        const { openReceivables } = await import("../payments");
        const items = await openReceivables(db, companyId, partyId);
        return items.map((i) => ({ id: i.id, kind: i.kind, number: i.number, date: i.date, dueDate: i.dueDate, total: rupees(i.total), balance: rupees(i.balance) }));
      },
      async list(opts = {}) {
        need("payments:read");
        const rows = await db.payment.findMany({
          where: {
            companyId,
            ...(opts.partyId && { partyId: opts.partyId }),
            ...((opts.from || opts.to) && { date: { ...(opts.from && { gte: new Date(opts.from) }), ...(opts.to && { lte: new Date(opts.to) }) } }),
          },
          include: { party: { select: { name: true } } },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: clampLimit(opts.limit),
        });
        return rows.map((r) => ({ id: r.id, direction: r.direction, number: r.reference, date: iso(r.date), partyId: r.partyId, partyName: r.party.name, amount: num(r.amount), mode: r.mode }));
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
      async get(id) {
        need("purchases:read");
        const b = await db.purchaseBill.findFirst({ where: { id: String(id), companyId }, include: { items: { orderBy: { position: "asc" } } } });
        if (!b) return null;
        return {
          id: b.id,
          billNo: b.billNumber,
          date: iso(b.billDate),
          supplierId: b.partyId,
          supplierName: b.partyName,
          supplierGstin: b.partyGstin,
          cancelled: b.cancelled,
          purchaseOrderId: b.purchaseOrderId,
          total: num(b.grandTotal),
          items: b.items.map(lineItem),
        };
      },
    },
    purchaseOrders: {
      async list(opts = {}) {
        need("purchaseOrders:read");
        const rows = await db.purchaseOrder.findMany({
          where: {
            companyId,
            ...(opts.status && { status: opts.status as never }),
            ...((opts.from || opts.to) && { date: { ...(opts.from && { gte: new Date(opts.from) }), ...(opts.to && { lte: new Date(opts.to) }) } }),
          },
          orderBy: [{ date: "desc" }, { seq: "desc" }],
          take: clampLimit(opts.limit),
        });
        return rows.map((o) => ({ id: o.id, number: o.number, date: iso(o.date), status: o.status, supplierName: o.partyName, total: num(o.grandTotal) }));
      },
      async get(id) {
        need("purchaseOrders:read");
        const o = await db.purchaseOrder.findFirst({ where: { id: String(id), companyId }, include: { items: { orderBy: { position: "asc" } } } });
        if (!o) return null;
        return {
          id: o.id,
          number: o.number,
          date: iso(o.date),
          expectedDate: iso(o.expectedDate),
          status: o.status,
          supplierId: o.partyId,
          supplierName: o.partyName,
          total: num(o.grandTotal),
          items: o.items.map((i) => ({ ...lineItem(i), id: i.id, billedQty: num(i.billedQty), remaining: Math.max(0, Math.round((num(i.qty) - num(i.billedQty)) * 1000) / 1000) })),
        };
      },
    },
  };

  const mail: PluginMail = {
    async send({ toUserIds = [], toPartyId, subject, html }) {
      need("mail:send");
      const to = new Set<string>();
      if (toUserIds.length) {
        const members = await db.membership.findMany({ where: { companyId, userId: { in: toUserIds.map(String) } }, include: { user: { select: { email: true, disabledAt: true } } } });
        for (const m of members) if (!m.user.disabledAt && m.user.email) to.add(m.user.email);
      }
      if (toPartyId) {
        const p = await db.party.findFirst({ where: { id: String(toPartyId), companyId }, select: { email: true } });
        if (p?.email) to.add(p.email);
      }
      if (!to.size) return { sent: 0 };
      // Daily limit per plugin and company, counted in the plugin's own storage.
      const dayKey = `_mail/${new Date().toISOString().slice(0, 10)}`;
      const sentToday = Number((await storage.get<number>(dayKey)) ?? 0);
      if (sentToday + to.size > MAIL_DAILY_LIMIT) throw new Error(`Daily email limit reached (${MAIL_DAILY_LIMIT} per company)`);
      const { sendMail } = await import("../mail");
      const from = company.tradeName || company.legalName;
      for (const addr of to) {
        await sendMail({ to: addr, subject: String(subject).slice(0, 200), html: `${String(html)}<p style="color:#888;font-size:12px">Sent by ${manifest.name} for ${from} via MyGST</p>` });
      }
      await storage.set(dayKey, sentToday + to.size);
      return { sent: to.size };
    },
  };

  const member = input.member ?? null;
  const companyBase = `/c/${companyId}`;
  return {
    pluginId,
    companyId,
    company: { id: company.id, legalName: company.legalName, tradeName: company.tradeName, gstin: company.gstin, stateCode: company.stateCode },
    user: input.user ?? null,
    role: input.role ?? null,
    // No user = the plugin itself acting (events, jobs).
    can: (capability) =>
      input.user ? canPlugin(member ?? { roles: input.role ? [{ key: input.role }] : [], permissions: new Set<string>() }, pluginId, manifest.capabilities, capability) : true,
    settings: readSettings(manifest.settings, input.settings),
    storage,
    db: pluginDb({ pluginId, companyId, manifest, userId: input.user?.id ?? null }),
    mail,
    log: {
      info: (m) => void pluginLog(pluginId, companyId, "info", m),
      warn: (m) => void pluginLog(pluginId, companyId, "warn", m),
      error: (m) => void pluginLog(pluginId, companyId, "error", m),
    },
    data,
    http: { fetch: (url, init) => safeFetch(url, init) },
    appUrl: (path) => absoluteUrl(path.startsWith("/") ? path : `/${path}`),
    pageUrl: (slug, ...path) => [`${companyBase}/apps/${pluginId}`, ...(slug ? [slug] : []), ...path.map((x) => encodeURIComponent(String(x)))].join("/"),
    companyUrl: (path) => `${companyBase}/${String(path).replace(/^\/+/, "")}`,
    actionUrl: (name) => `/api/plugins/${pluginId}/_action/${encodeURIComponent(name)}?companyId=${encodeURIComponent(companyId)}`,
  };
}
