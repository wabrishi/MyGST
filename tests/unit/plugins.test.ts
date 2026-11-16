import { describe, expect, it } from "vitest";
import { companyPluginState, isAvailableTo, isPluginActive } from "@/lib/plugins/access";
import { collectPlugin } from "@/lib/plugins/collect";
import { newPermissions, parseManifest, semverGte } from "@/lib/plugins/manifest";
import { isPrivateAddress } from "@/lib/plugins/net";
import { definePlugin } from "@/lib/plugins/sdk";
import { prepareSettings, readSettings, settingsForForm } from "@/lib/plugins/settings";
import { createPluginTestContext, loadForTest } from "@/lib/plugins/testing";
import { signPageToken, verifyPageToken } from "@/lib/plugins/token";
import invoiceFooter from "@/plugins/invoice-footer";
import poNumber, { findPo } from "@/plugins/po-number";
import slackNotify from "@/plugins/slack-notify";

process.env.BACKUP_ENCRYPTION_KEY ??= "unit-test-key";

describe("manifest validation", () => {
  const base = { id: "my-plugin", name: "My plugin", version: "1.0.0" };

  it("fills defaults", () => {
    const m = parseManifest(base, "CODE");
    expect(m).toMatchObject({ permissions: [], events: [], filters: [], pages: [], settings: [], icon: "Puzzle" });
  });

  it("rejects bad ids, versions, unknown permissions and events", () => {
    expect(() => parseManifest({ ...base, id: "My_Plugin" }, "CODE")).toThrow();
    expect(() => parseManifest({ ...base, version: "1.0" }, "CODE")).toThrow();
    expect(() => parseManifest({ ...base, permissions: ["db:all"] }, "CODE")).toThrow();
    expect(() => parseManifest({ ...base, events: ["invoice.deleted"] }, "CODE")).toThrow();
  });

  it("requires the permission that matches each event", () => {
    expect(() => parseManifest({ ...base, events: ["payment.received"] }, "CODE")).toThrow(/payments:read/);
    expect(parseManifest({ ...base, events: ["payment.received"], permissions: ["payments:read"] }, "CODE").events).toEqual(["payment.received"]);
  });

  it("external plugins: https URLs, webhook for events, only the validate filter", () => {
    const ext = { ...base, permissions: ["documents:read"], events: ["invoice.issued"] };
    expect(() => parseManifest(ext, "EXTERNAL")).toThrow(/webhookUrl/);
    expect(() => parseManifest({ ...ext, webhookUrl: "http://evil.example.com/hook" }, "EXTERNAL")).toThrow(/https/);
    expect(parseManifest({ ...ext, webhookUrl: "https://plugin.example.com/hook" }, "EXTERNAL").webhookUrl).toBe("https://plugin.example.com/hook");
    expect(() => parseManifest({ ...base, filters: ["pdf.sections"], webhookUrl: "https://x.example.com" }, "EXTERNAL")).toThrow(/document.validate/);
    expect(() => parseManifest({ ...base, webhookUrl: "https://x.example.com" }, "CODE")).toThrow(/external plugins only/);
  });

  it("semver and permission upgrades", () => {
    expect(semverGte("1.2.10", "1.2.9")).toBe(true);
    expect(semverGte("1.2.0", "1.10.0")).toBe(false);
    expect(semverGte("2.0.0", "2.0.0")).toBe(true);
    expect(newPermissions(["documents:read"], ["documents:read", "payments:read"])).toEqual(["payments:read"]);
  });
});

describe("availability (super admin) × owner switch", () => {
  const plugin = (availability: "ALL" | "SELECTED" | "NONE", defaultEnabled: boolean) => ({ status: "INSTALLED" as const, availability, defaultEnabled });
  const cp = (o: Partial<{ allowed: boolean; blocked: boolean; enabled: boolean | null; pausedReason: string | null }> = {}) => ({ allowed: false, blocked: false, enabled: null, pausedReason: null, ...o });

  it("ALL + on by default: active for a company with no row, owner can turn it off", () => {
    expect(isPluginActive(plugin("ALL", true), null)).toBe(true);
    expect(isPluginActive(plugin("ALL", true), cp({ enabled: false }))).toBe(false);
    expect(companyPluginState(plugin("ALL", true), cp({ enabled: false }))).toBe("OFF");
  });

  it("ALL + off by default: owner turns it on", () => {
    expect(isPluginActive(plugin("ALL", false), null)).toBe(false);
    expect(isPluginActive(plugin("ALL", false), cp({ enabled: true }))).toBe(true);
  });

  it("blocked companies and NONE are never active, whatever the owner chose", () => {
    expect(isPluginActive(plugin("ALL", true), cp({ blocked: true, enabled: true }))).toBe(false);
    expect(companyPluginState(plugin("ALL", true), cp({ blocked: true }))).toBe("BLOCKED");
    expect(isPluginActive(plugin("NONE", true), cp({ enabled: true, allowed: true }))).toBe(false);
  });

  it("SELECTED: only allowed companies", () => {
    expect(isAvailableTo(plugin("SELECTED", true), null)).toBe(false);
    expect(isPluginActive(plugin("SELECTED", true), cp({ allowed: true }))).toBe(true);
    expect(companyPluginState(plugin("SELECTED", true), null)).toBe("NOT_ALLOWED");
  });

  it("paused plugins and uninstalled plugins are inactive", () => {
    expect(isPluginActive(plugin("ALL", true), cp({ pausedReason: "errors" }))).toBe(false);
    expect(isPluginActive({ status: "NOT_INSTALLED", availability: "ALL", defaultEnabled: true }, null)).toBe(false);
  });
});

describe("settings", () => {
  const fields = parseManifest(
    {
      id: "set-test",
      name: "Set test",
      version: "1.0.0",
      settings: [
        { key: "token", label: "Token", type: "secret", required: true },
        { key: "count", label: "Count", type: "number", default: 3 },
        { key: "on", label: "On", type: "boolean" },
        { key: "mode", label: "Mode", type: "select", options: [{ value: "a", label: "A" }] },
      ],
    },
    "CODE",
  ).settings;

  it("encrypts secrets, keeps them when left blank, validates types", () => {
    const first = prepareSettings(fields, { token: "s3cret", count: "5", on: "on", mode: "a" }, null);
    expect(first.errors).toEqual({});
    expect(JSON.stringify(first.stored)).not.toContain("s3cret");
    expect(readSettings(fields, first.stored)).toEqual({ token: "s3cret", count: 5, on: true, mode: "a" });
    expect(settingsForForm(fields, first.stored)).toEqual({ values: { count: 5, on: true, mode: "a" }, secretsSet: { token: true } });

    const second = prepareSettings(fields, { token: "", count: "x", mode: "b" }, first.stored);
    expect(second.errors).toMatchObject({ count: expect.stringMatching(/number/), mode: expect.stringMatching(/valid/) });
    expect(readSettings(fields, second.stored).token).toBe("s3cret");
    expect(prepareSettings(fields, {}, first.stored, ["token"]).errors.token).toMatch(/required/);
  });

  it("defaults when nothing is stored", () => {
    expect(readSettings(fields, null)).toEqual({ token: "", count: 3, on: false, mode: "" });
  });
});

describe("page tokens and network guard", () => {
  it("signs and verifies, rejects tampering and expiry", () => {
    const t = signPageToken("sec", { plugin: "p", companyId: "c", userId: "u", name: "N", role: "OWNER", view: "home" }, 300, 1_000_000);
    expect(verifyPageToken("sec", t, 1_000_000)).toMatchObject({ plugin: "p", companyId: "c", view: "home" });
    expect(verifyPageToken("other", t, 1_000_000)).toBeNull();
    expect(verifyPageToken("sec", t.replace(/^./, "x"), 1_000_000)).toBeNull();
    expect(verifyPageToken("sec", t, 1_000_000 + 301_000)).toBeNull();
  });

  it("detects private addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "0.0.0.0"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("plugin loading", () => {
  it("rejects hooks that aren't declared in the manifest", () => {
    const bad = definePlugin({ manifest: { id: "bad-one", name: "Bad", version: "1.0.0" }, setup: (api) => api.on("invoice.issued", () => {}) });
    expect(() => collectPlugin(bad)).toThrow(/manifest.events/);
    const noPage = definePlugin({ manifest: { id: "bad-two", name: "Bad", version: "1.0.0", pages: [{ slug: "home", title: "Home" }] }, setup: () => {} });
    expect(() => collectPlugin(noPage)).toThrow(/api.page/);
    expect(() => collectPlugin(definePlugin({ manifest: { id: "abc", name: "Abc", version: "1.0.0" }, setup: () => {} }), "other")).toThrow(/folder/);
  });

  it("orders handlers by priority", () => {
    const order: number[] = [];
    const p = collectPlugin(
      definePlugin({
        manifest: { id: "prio", name: "Prio", version: "1.0.0", permissions: ["documents:read"], events: ["invoice.issued"] },
        setup(api) {
          api.on("invoice.issued", () => void order.push(20), { priority: 20 });
          api.on("invoice.issued", () => void order.push(5), { priority: 5 });
          api.on("invoice.issued", () => void order.push(10));
        },
      }),
    );
    expect(p.actions.get("invoice.issued")?.map((h) => h.priority)).toEqual([5, 10, 20]);
  });
});

describe("example plugins", () => {
  const doc = { id: "d1", type: "INVOICE" as const, number: "INV/26-27/0001", date: "2026-11-16", status: "ISSUED", partyId: "p1", partyName: "Asha", partyGstin: "", total: 1180, customFields: {} };
  const args = (notes: string, gstin = "") => ({
    type: "INVOICE" as const,
    documentId: null,
    input: { partyId: "p1", date: "2026-11-16", placeOfSupply: "27", notes, items: [{ description: "x", qty: 1, rate: 1000, gstRate: 18 }] },
    party: { id: "p1", name: "Asha", gstin, stateCode: "27", customFields: {} },
  });

  it("po-number: parses POs, requires them by rule, stores a PDF custom field", async () => {
    expect(findPo("Ref PO: 4500012345 thanks")).toBe("4500012345");
    expect(findPo("P.O. No. ab-77")).toBe("AB-77");
    expect(findPo("no order here")).toBeNull();

    const p = loadForTest(poNumber);
    const ctx = createPluginTestContext({ manifest: p.manifest, settings: { requireFor: "registered" } });
    await expect(p.applyFilter("document.validate", undefined, args("", "27AAPFU0939F1ZV"), ctx)).rejects.toThrow(/purchase order/);
    await expect(p.applyFilter("document.validate", undefined, args(""), ctx)).resolves.toBeUndefined(); // unregistered: optional
    const out = await p.applyFilter("document.beforeSave", { notes: "PO: 77", customFields: {} }, args("PO: 77"), ctx);
    expect(out.customFields["po-number.po"]).toEqual({ label: "Customer PO", value: "77", onPdf: true });
  });

  it("invoice-footer: adds the message to invoice PDFs, not quotations unless asked", async () => {
    const p = loadForTest(invoiceFooter);
    const ctx = createPluginTestContext({ manifest: p.manifest, settings: { message: "Thanks!\nVisit again" } });
    expect(await p.applyFilter("pdf.sections", [], { document: doc }, ctx)).toEqual([{ lines: ["Thanks!", "Visit again"] }]);
    expect(await p.applyFilter("pdf.sections", [], { document: { ...doc, type: "QUOTATION" } }, ctx)).toEqual([]);
  });

  it("slack-notify: posts once per event (idempotent), throws on Slack errors so it's retried", async () => {
    const p = loadForTest(slackNotify);
    const ctx = createPluginTestContext({ manifest: p.manifest, settings: { webhookUrl: "https://hooks.slack.com/services/T/B/X", payments: true } });
    await p.emit("invoice.issued", { number: "INV/1", total: 1180 }, ctx, "evt_1");
    await p.emit("invoice.issued", { number: "INV/1", total: 1180 }, ctx, "evt_1");
    expect(ctx.requests).toHaveLength(1);
    expect(JSON.parse(String(ctx.requests[0].init?.body)).text).toMatch(/INV\/1.*₹1,180\.00/);

    const failing = createPluginTestContext({ manifest: p.manifest, settings: { webhookUrl: "https://hooks.slack.com/x" }, fetch: async () => new Response("no", { status: 500 }) });
    await expect(p.emit("payment.received", { amount: 5 }, failing)).rejects.toThrow(/HTTP 500/);
  });
});
