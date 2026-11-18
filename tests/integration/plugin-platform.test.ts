import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Plugin } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { saveDocument } from "@/lib/documents";
import { deliverPending } from "@/lib/events/outbox";
import { todayIST } from "@/lib/gst/fy";
import { runFormAction } from "@/lib/plugins/actions";
import { runDueJobs } from "@/lib/plugins/jobs";
import { installPlugin, setCompanyAccess, syncCodePlugins } from "@/lib/plugins/manage";
import { pluginDb } from "@/lib/plugins/records";
import { codePlugin } from "@/lib/plugins/registry";
import { loadBundle } from "@/lib/plugins/uploaded";
import { activeEntries } from "@/lib/plugins/runner";
import { cancelPurchase, savePurchase } from "@/lib/purchases";
import type { CompanyContext } from "@/lib/tenant";
import type { Lead } from "@/plugins/lead-manager/model";
import { memberContext } from "./helpers";

/**
 * The plugin platform against the real database: data tables, form actions, events with line items,
 * scheduled jobs, and Lead Manager end to end. Lead Manager is installed for this file's companies only
 * (SELECTED availability) and put back as it was afterwards.
 */
describe("plugin platform", () => {
  const ID = "lead-manager";
  let owner: CompanyContext;
  let staff: CompanyContext;
  let other: CompanyContext;
  let saved: Plugin | null = null;
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const users: string[] = [];

  const makeUser = async (tag: string) => {
    const u = await db.user.create({ data: { id: `pp-${tag}-${stamp}`, name: `PP ${tag}`, email: `pp-${tag}-${stamp}@test.local` } });
    users.push(u.id);
    return u;
  };
  const leads = (ctx: CompanyContext, pluginId = ID) => pluginDb({ pluginId, companyId: ctx.companyId, manifest: codePlugin(ID)!.manifest }).collection<Lead>("leads");
  const entry = async (ctx: CompanyContext) => (await activeEntries(ctx.companyId)).find((e) => e.plugin.id === ID)!;
  const post = async (ctx: CompanyContext, name: string, values: Record<string, string>, origin = "http://localhost:3000") => {
    const form = new FormData();
    for (const [k, v] of Object.entries(values)) form.set(k, v);
    const request = new Request(`http://localhost:3000/api/plugins/${ID}/_action/${name}?companyId=${ctx.companyId}`, { method: "POST", body: form, headers: { origin } });
    return runFormAction(request, { code: codePlugin(ID)!, entry: await entry(ctx), companyId: ctx.companyId, user: ctx.user, grants: ctx, name });
  };

  /** The ?_ok / ?_error message an action redirected with. */
  const notice = (res: Response) => {
    const q = new URL(res.headers.get("location") ?? "/", "http://x").searchParams;
    return { ok: q.get("_ok"), error: q.get("_error") };
  };

  beforeAll(async () => {
    await syncCodePlugins();
    saved = await db.plugin.findUnique({ where: { id: ID } });
    const company = await db.company.create({ data: { legalName: `PP Co ${stamp}`, stateCode: "27", address: "Pune" } });
    owner = await memberContext(await makeUser("owner"), company);
    staff = await memberContext(await makeUser("staff"), company, ["STAFF"]);
    const company2 = await db.company.create({ data: { legalName: `PP Other ${stamp}`, stateCode: "27", address: "Pune" } });
    other = await memberContext(await makeUser("other"), company2);
    if (saved?.status !== "INSTALLED") await installPlugin(ID, { availability: "SELECTED", defaultEnabled: true, by: "test" });
    for (const c of [owner, other]) await setCompanyAccess(ID, c.companyId, { allowed: true });
    await db.companyPlugin.update({ where: { companyId_pluginId: { companyId: owner.companyId, pluginId: ID } }, data: { settings: { digest: false } } });
  });

  afterAll(async () => {
    for (const c of [owner, other]) {
      await db.outboxEvent.deleteMany({ where: { companyId: c.companyId } });
      await db.paymentAllocation.deleteMany({ where: { purchaseBill: { companyId: c.companyId } } });
      await db.purchaseBill.deleteMany({ where: { companyId: c.companyId } });
      await db.document.deleteMany({ where: { companyId: c.companyId } });
      await db.pluginLog.deleteMany({ where: { companyId: c.companyId } });
    }
    await db.company.deleteMany({ where: { id: { in: [owner.companyId, other.companyId] } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    if (saved) {
      await db.plugin.update({ where: { id: ID }, data: { status: saved.status, availability: saved.availability, defaultEnabled: saved.defaultEnabled, installedAt: saved.installedAt, installedBy: saved.installedBy } });
    }
    await db.$disconnect();
  });

  it("data tables: insert, filter, sort, count, sum — isolated per company and plugin", async () => {
    const t = leads(owner);
    await t.insert({ name: "Alpha", stage: "New", value: 1000, ownerId: "u1", search: "alpha" } as Lead);
    await t.insert({ name: "Beta", stage: "New", value: 2500, ownerId: "u2", search: "beta traders" } as Lead);
    await t.insert({ name: "Gamma", stage: "Won", value: 4000, ownerId: "u1", search: "gamma" } as Lead);

    expect((await t.find({ where: { stage: "New" }, orderBy: "-value" })).map((r) => r.name)).toEqual(["Beta", "Alpha"]);
    expect(await t.count({ ownerId: "u1" })).toBe(2);
    expect(await t.sum("value", { value: { gte: 2000 } })).toBe(6500);
    expect((await t.find({ where: { search: { contains: "TRADERS" } } })).map((r) => r.name)).toEqual(["Beta"]);
    const a = (await t.findOne({ search: "alpha" }))!;
    const updated = await t.update(a.id, { stage: "Won", notes: "kept in JSON" } as Partial<Lead>);
    expect(updated).toMatchObject({ name: "Alpha", stage: "Won", notes: "kept in JSON" });
    expect(await t.count({ stage: "Won" })).toBe(2);

    // Another company, and another plugin in the same company, see nothing.
    expect(await leads(other).count()).toBe(0);
    expect(await leads(owner, "po-number").count()).toBe(0);
    expect(await leads(other).get(a.id)).toBeNull();
    await expect(leads(other).update(a.id, { stage: "Lost" })).rejects.toThrow(/not found/);
    await expect(t.find({ where: { notes: "x" } as never })).rejects.toThrow(/add it to indexes/);
    await t.deleteMany({ stage: { in: ["New", "Won"] } });
    expect(await t.count()).toBe(0);
  });

  it("form actions: run with the member's permissions and refuse other sites", async () => {
    const created = await post(owner, "createLead", { name: "Ravi", company: "Acme", value: "75000" });
    expect(created.status).toBe(303);
    expect(created.headers.get("location")).toMatch(new RegExp(`^/c/${owner.companyId}/apps/${ID}/leads/\\w+\\?_ok=Lead\\+created$`));
    const [lead] = await leads(owner).find({ where: { search: { contains: "ravi" } } });
    expect(lead).toMatchObject({ stage: "New", value: 75000, ownerId: owner.user.id });

    // Staff can't see the owner's lead or convert it.
    const denied = await post(staff, "convertLead", { id: lead.id });
    expect(notice(denied).error).toBe("You don't have permission to do that");
    const hidden = await post(staff, "moveStage", { id: lead.id, dir: "next" });
    expect(notice(hidden).error).toBe("Lead not found");

    expect((await post(owner, "moveStage", { id: lead.id, dir: "next" }, "https://evil.example")).status).toBe(403);
    expect((await leads(owner).get(lead.id))!.stage).toBe("New");
  });

  it("Lead Manager end to end: convert, quote (→ Proposal), invoice (→ Won)", async () => {
    await post(owner, "createLead", { name: "Meera", company: "Blue Traders", gstin: "" });
    const [lead] = await leads(owner).find({ where: { search: { contains: "meera" } } });
    await post(owner, "convertLead", { id: lead.id });
    const converted = (await leads(owner).get(lead.id))!;
    const party = await db.party.findUniqueOrThrow({ where: { id: converted.partyId } });
    expect(party).toMatchObject({ companyId: owner.companyId, name: "Blue Traders", externalRef: `lead-manager:${lead.id}` });

    const q = await post(owner, "quickQuotation", { id: lead.id, item: "Annual maintenance", qty: "1", rate: "10000", gstRate: "18" });
    expect(notice(q).ok).toMatch(/^Quotation .+ created$/);
    const quote = await db.document.findFirstOrThrow({ where: { companyId: owner.companyId, type: "QUOTATION", partyId: party.id } });
    expect(quote.externalRef).toBe(`lead-manager:${lead.id}`);

    // The quotation.created event (with line items) is delivered to the plugin.
    const evt = await db.outboxEvent.findFirstOrThrow({ where: { companyId: owner.companyId, pluginId: ID, type: "quotation.created" } });
    expect((evt.envelope as { data: { items: unknown[]; partyName: string } }).data).toMatchObject({ partyName: "Blue Traders", items: [{ description: "Annual maintenance", qty: 1, rate: 10000, gstRate: 18, taxable: 10000 }] });
    await deliverPending({ companyId: owner.companyId });
    expect((await leads(owner).get(lead.id))!.stage).toBe("Proposal");

    await saveDocument(owner, "INVOICE", null, { partyId: party.id, date: todayIST(), placeOfSupply: "27", items: [{ description: "Annual maintenance", qty: 1, rate: 10000, gstRate: 18 }] });
    await deliverPending({ companyId: owner.companyId });
    const won = (await leads(owner).get(lead.id))!;
    expect(won.stage).toBe("Won");
    expect(won.quotations.map((x) => x.number)).toEqual([quote.number]);
  });

  it("purchase events carry items, and cancelling fires purchase.cancelled", async () => {
    // Events are only queued for installed plugins that listen: add a temporary listener for purchases.
    const supplier = await db.party.create({ data: { companyId: owner.companyId, type: "SUPPLIER", name: "Steel Co", stateCode: "27", gstin: "" } });
    const before = await db.plugin.findUniqueOrThrow({ where: { id: ID } });
    const manifest = { ...(codePlugin(ID)!.manifest as object), events: ["purchase.saved", "purchase.cancelled"], permissions: ["purchases:read"] };
    const tempId = `pp-purchases-${stamp}`.slice(0, 60);
    await db.plugin.create({ data: { id: tempId, kind: "EXTERNAL", name: "Purchases listener", version: "1.0.0", manifest: { ...manifest, id: tempId, collections: [], jobs: [], pages: [], widgets: [], capabilities: [], webhookUrl: "https://example.invalid/hook" }, status: "INSTALLED", availability: "SELECTED" } });
    await db.companyPlugin.create({ data: { companyId: owner.companyId, pluginId: tempId, allowed: true, enabled: true } });
    try {
      const billId = await savePurchase(owner, null, { partyId: supplier.id, billNumber: `SUP-${stamp.slice(-6)}`, billDate: todayIST(), placeOfSupply: "27", items: [{ description: "Rods", qty: 4, rate: 250, gstRate: 18 }] });
      await cancelPurchase(owner, billId);
      const events = await db.outboxEvent.findMany({ where: { companyId: owner.companyId, pluginId: tempId }, orderBy: { createdAt: "asc" } });
      expect(events.map((e) => e.type)).toEqual(["purchase.saved", "purchase.cancelled"]);
      for (const e of events) expect((e.envelope as { data: { items: unknown[] } }).data.items).toEqual([expect.objectContaining({ description: "Rods", qty: 4, rate: 250, taxable: 1000 })]);
    } finally {
      await db.outboxEvent.deleteMany({ where: { pluginId: tempId } });
      await db.plugin.delete({ where: { id: tempId } });
      expect((await db.plugin.findUniqueOrThrow({ where: { id: ID } })).manifest).toEqual(before.manifest);
    }
  });

  it("a downloaded built-in plugin uploads again under another id", () => {
    execFileSync(process.execPath, ["scripts/pack-plugin.mjs", ID, "--id", "lead-manager-rt"], { stdio: "pipe" });
    const file = "dist-plugins/lead-manager-rt-1.0.0.mygst-plugin.js";
    try {
      const p = loadBundle(readFileSync(file, "utf8"), "lead-manager-rt");
      expect(p.manifest).toMatchObject({ id: "lead-manager-rt", name: "Lead Manager (lead-manager-rt)" });
      expect(p.manifest.collections.map((c) => c.name)).toEqual(["leads", "activities"]);
      expect([...p.formActions.keys()]).toContain("convertLead");
      expect(p.pages.size).toBe(3);
      expect(p.jobs.has("digest")).toBe(true);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it("scheduled jobs run once per period per company", async () => {
    const now = new Date(`${todayIST()}T06:00:00Z`); // 11:30 IST
    await runDueJobs({ now, limit: 500 });
    const run = await db.pluginJobRun.findUniqueOrThrow({ where: { pluginId_companyId_job: { pluginId: ID, companyId: owner.companyId, job: "digest" } } });
    expect(run.lastRunAt.toISOString()).toBe(now.toISOString());
    expect(run.lastError).toBeNull();
    await runDueJobs({ now: new Date(now.getTime() + 3600_000), limit: 500 });
    expect((await db.pluginJobRun.findUniqueOrThrow({ where: { id: run.id } })).lastRunAt.toISOString()).toBe(now.toISOString());
  });
});
