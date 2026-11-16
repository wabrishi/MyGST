import "dotenv/config";
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Plugin } from "@/generated/prisma/client";
import { handle } from "@/lib/api/http";
import { db } from "@/lib/db";
import { loadDocument, saveDocument } from "@/lib/documents";
import { deliverPending } from "@/lib/events/outbox";
import { todayIST } from "@/lib/gst/fy";
import { buildPluginContext } from "@/lib/plugins/context";
import { PAUSE_AFTER_FAILURES, recordFailure } from "@/lib/plugins/log";
import { addExternalPlugin, installPlugin, saveCompanySettings, setAvailability, setCompanyAccess, setCompanyEnabled, syncCodePlugins, uninstallPlugin } from "@/lib/plugins/manage";
import { activeEntries, applyFilters } from "@/lib/plugins/runner";
import { verifyPageToken } from "@/lib/plugins/token";
import type { CompanyContext } from "@/lib/tenant";

/**
 * Plugins against the real database. Uses SELECTED availability (only this file's companies), so test files
 * running in parallel never see these plugins; plugin rows are restored afterwards.
 */
describe("plugins", () => {
  let a: CompanyContext;
  let b: CompanyContext;
  let server: Server;
  let base = "";
  const received: Array<{ path: string; headers: Record<string, string>; body: string }> = [];
  const CODE_IDS = ["invoice-footer", "po-number", "slack-notify"];
  const EXT_ID = `ext-test-${Date.now().toString(36)}`;
  let saved: Plugin[] = [];

  const makeCompany = async (name: string): Promise<CompanyContext> => {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const user = await db.user.create({ data: { id: `plg-${stamp}`, name: "Plugin Tester", email: `plg-${stamp}@test.local` } });
    const company = await db.company.create({ data: { legalName: name, stateCode: "27", address: "Pune" } });
    await db.membership.create({ data: { userId: user.id, companyId: company.id, role: "OWNER" } });
    return { user: { id: user.id, name: user.name, email: user.email }, companyId: company.id, role: "OWNER", company: { id: company.id, legalName: name, tradeName: "", stateCode: "27", gstin: "" } };
  };
  const invoice = async (ctx: CompanyContext, notes = "PO: 1001") => {
    const party = await db.party.create({ data: { companyId: ctx.companyId, name: "Buyer", stateCode: "27", gstin: "" } });
    return saveDocument(ctx, "INVOICE", null, { partyId: party.id, date: todayIST(), placeOfSupply: "27", notes, items: [{ description: "Work", qty: 1, rate: 1000, gstRate: 18 }] });
  };
  const active = async (companyId: string) => (await activeEntries(companyId)).map((e) => e.plugin.id).sort();

  beforeAll(async () => {
    process.env.BACKUP_ENCRYPTION_KEY ??= process.env.BETTER_AUTH_SECRET;
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ path: req.url ?? "", headers: req.headers as Record<string, string>, body });
        if (req.url === "/manifest.json") {
          res.writeHead(200, { "Content-Type": "application/json" }).end(
            JSON.stringify({
              id: EXT_ID,
              name: "External test",
              version: "1.0.0",
              permissions: ["documents:read"],
              events: ["invoice.issued"],
              webhookUrl: `${base}/hook`,
              pageBaseUrl: `${base}/ui`,
              pages: [{ slug: "home", title: "Home" }],
            }),
          );
        } else res.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;

    await syncCodePlugins();
    saved = await db.plugin.findMany({ where: { id: { in: CODE_IDS } } });
    a = await makeCompany("Plugin Co A");
    b = await makeCompany("Plugin Co B");
  });

  afterAll(async () => {
    server.close();
    await uninstallPlugin(EXT_ID, { keepData: false }).catch(() => {});
    for (const c of [a, b]) {
      await db.outboxEvent.deleteMany({ where: { companyId: c.companyId } });
      await db.document.deleteMany({ where: { companyId: c.companyId } });
      await db.company.delete({ where: { id: c.companyId } });
      await db.user.delete({ where: { id: c.user.id } });
    }
    // Restore the code plugins exactly as they were in this database.
    for (const p of saved) {
      await db.plugin.update({ where: { id: p.id }, data: { status: p.status, availability: p.availability, defaultEnabled: p.defaultEnabled, installedAt: p.installedAt, installedBy: p.installedBy } });
    }
    await db.pluginLog.deleteMany({ where: { companyId: { in: [a.companyId, b.companyId] } } });
    await db.$disconnect();
  });

  it("code plugins are registered from src/plugins", async () => {
    const rows = await db.plugin.findMany({ where: { id: { in: CODE_IDS } } });
    expect(rows.map((r) => [r.id, r.kind]).sort()).toEqual(CODE_IDS.map((id) => [id, "CODE"]));
  });

  it("availability matrix: SELECTED, allow, owner off, default, NONE", async () => {
    await installPlugin("po-number", { availability: "SELECTED", defaultEnabled: true, by: "test" });
    expect(await active(a.companyId)).not.toContain("po-number"); // not allowed yet
    await setCompanyAccess("po-number", a.companyId, { allowed: true });
    expect(await active(a.companyId)).toContain("po-number"); // on by default
    expect(await active(b.companyId)).not.toContain("po-number");

    await setCompanyEnabled("po-number", a.companyId, false, a.user.id);
    expect(await active(a.companyId)).not.toContain("po-number");
    await setCompanyEnabled("po-number", a.companyId, true, a.user.id);
    expect(await active(a.companyId)).toContain("po-number");
    await expect(setCompanyEnabled("po-number", b.companyId, true, b.user.id)).rejects.toThrow(/isn't available/);

    await setAvailability("po-number", { availability: "NONE" });
    expect(await active(a.companyId)).not.toContain("po-number");
    await setAvailability("po-number", { availability: "SELECTED" });
    expect(await active(a.companyId)).toContain("po-number");
  });

  it("document hooks: validate blocks, beforeSave stores a custom field, PDF sections", async () => {
    await saveCompanySettings("po-number", a.companyId, { requireFor: "all" });
    await expect(invoice(a, "no po here")).rejects.toThrow(/purchase order number/);
    const id = await invoice(a, "Against PO: 4500099");
    const doc = await loadDocument(a.companyId, id);
    expect(doc?.customFields["po-number.po"]).toEqual({ label: "Customer PO", value: "4500099", onPdf: true });
    // Company B doesn't have the plugin: no rule, no field.
    const idB = await invoice(b, "nothing");
    expect((await loadDocument(b.companyId, idB))?.customFields).toEqual({});

    await installPlugin("invoice-footer", { availability: "SELECTED", defaultEnabled: false, by: "test" });
    await setCompanyAccess("invoice-footer", a.companyId, { allowed: true });
    expect(await active(a.companyId)).not.toContain("invoice-footer"); // off by default: owner turns it on
    await setCompanyEnabled("invoice-footer", a.companyId, true, a.user.id);
    await saveCompanySettings("invoice-footer", a.companyId, { message: "Thank you!" });
    const summary = { id, type: "INVOICE" as const, number: doc!.number, date: doc!.date, status: "ISSUED", partyId: doc!.partyId, partyName: "Buyer", partyGstin: "", total: 1180, customFields: {} };
    expect(await applyFilters({ companyId: a.companyId }, "pdf.sections", [], { document: summary })).toEqual([{ lines: ["Thank you!"] }]);
    expect(await applyFilters({ companyId: b.companyId }, "pdf.sections", [], { document: summary })).toEqual([]);
  });

  it("storage is isolated per company and plugin; data API checks permissions", async () => {
    const manifest = (await activeEntries(a.companyId)).find((e) => e.plugin.id === "po-number")!.manifest;
    const ctxA = await buildPluginContext({ pluginId: "po-number", manifest, companyId: a.companyId, settings: null });
    const ctxB = await buildPluginContext({ pluginId: "po-number", manifest, companyId: b.companyId, settings: null });
    await ctxA.storage.set("k", { v: 1 });
    expect(await ctxA.storage.get("k")).toEqual({ v: 1 });
    expect(await ctxB.storage.get("k")).toBeNull();
    expect((await ctxA.data.documents.list({ type: "INVOICE" })).every((d) => d.partyName === "Buyer")).toBe(true);
    await expect(ctxA.data.payments.receivables()).rejects.toThrow(/payments:read/); // not declared by po-number
    await expect(ctxA.data.parties.upsert({ name: "x" })).rejects.toThrow(/parties:write/);
  });

  it("code plugin events are queued per active plugin and delivered in-process with retries", async () => {
    await installPlugin("slack-notify", { availability: "SELECTED", defaultEnabled: true, by: "test" });
    await setCompanyAccess("slack-notify", a.companyId, { allowed: true });
    await saveCompanySettings("slack-notify", a.companyId, { webhookUrl: `${base}/slack`, payments: true });
    received.length = 0;
    await invoice(a);
    const rows = await db.outboxEvent.findMany({ where: { companyId: a.companyId, pluginId: "slack-notify" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("invoice.issued");
    await deliverPending({ companyId: a.companyId });
    const slack = received.filter((r) => r.path === "/slack");
    expect(slack).toHaveLength(1);
    expect(JSON.parse(slack[0].body).text).toMatch(/Invoice \*INV\//);
    expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: rows[0].id } })).status).toBe("SENT");
    expect(await db.outboxEvent.count({ where: { companyId: b.companyId, pluginId: { not: null } } })).toBe(0);
  });

  it("auto-pauses after repeated failures; turning it on again clears the pause", async () => {
    for (let i = 0; i < PAUSE_AFTER_FAILURES; i++) await recordFailure("slack-notify", a.companyId, "test", new Error("boom"));
    expect(await active(a.companyId)).not.toContain("slack-notify");
    const cp = await db.companyPlugin.findUniqueOrThrow({ where: { companyId_pluginId: { companyId: a.companyId, pluginId: "slack-notify" } } });
    expect(cp.pausedReason).toMatch(/Paused after 20/);
    await setCompanyEnabled("slack-notify", a.companyId, true, a.user.id);
    expect(await active(a.companyId)).toContain("slack-notify");
  });

  it("external plugins: install handshake, signed events, scoped API key, revoked on disable", async () => {
    const { id } = await addExternalPlugin(`${base}/manifest.json`);
    expect(id).toBe(EXT_ID);
    received.length = 0;
    await installPlugin(EXT_ID, { availability: "SELECTED", defaultEnabled: true, by: "test" });
    await setCompanyAccess(EXT_ID, a.companyId, { allowed: true });

    const installed = received.find((r) => r.path === "/hook" && JSON.parse(r.body).type === "plugin.installed");
    expect(installed).toBeTruthy();
    const payload = JSON.parse(installed!.body);
    const secret: string = payload.data.webhookSecret;
    const apiKey: string = payload.data.apiKey;
    const sign = (ts: string, body: string) => "v1=" + createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    expect(installed!.headers["x-mygst-signature"]).toBe(sign(installed!.headers["x-mygst-timestamp"], installed!.body));
    expect(payload).toMatchObject({ companyId: a.companyId, data: { permissions: ["documents:read"], apiBaseUrl: expect.stringMatching(/\/api\/v1$/) } });

    // Events for that company arrive signed with the per-install secret.
    received.length = 0;
    await invoice(a);
    await deliverPending({ companyId: a.companyId });
    const ev = received.find((r) => r.path === "/hook");
    expect(JSON.parse(ev!.body)).toMatchObject({ type: "invoice.issued", companyId: a.companyId });
    expect(ev!.headers["x-mygst-signature"]).toBe(sign(ev!.headers["x-mygst-timestamp"], ev!.body));

    // The key is limited to the plugin's permissions.
    const req = (route: string) => handle(new Request("http://x/api", { headers: { Authorization: `Bearer ${apiKey}` } }), route, async () => ({ body: { ok: true } }));
    expect((await req("documents.list")).status).toBe(200);
    expect((await req("quotations.create")).status).toBe(403);

    // Framed pages get a token the plugin can verify with its secret.
    const { externalFrameUrl } = await import("@/lib/plugins/ui");
    const entry = (await activeEntries(a.companyId)).find((e) => e.plugin.id === EXT_ID)!;
    const url = new URL(externalFrameUrl(entry, a, "home")!);
    expect(url.pathname).toBe("/ui/home");
    expect(verifyPageToken(secret, url.searchParams.get("mygst_token")!)).toMatchObject({ plugin: EXT_ID, companyId: a.companyId, role: "OWNER", view: "home" });

    // Owner turns it off: plugin.uninstalled is sent and the key stops working.
    received.length = 0;
    await setCompanyEnabled(EXT_ID, a.companyId, false, a.user.id);
    expect(received.some((r) => JSON.parse(r.body).type === "plugin.uninstalled")).toBe(true);
    expect((await req("documents.list")).status).toBe(401);
  });
});
