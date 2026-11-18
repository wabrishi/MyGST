import { describe, expect, it } from "vitest";
import { safeCompanyPath, sameOrigin, withNotice } from "@/lib/plugins/action-helpers";
import { isJobDue } from "@/lib/plugins/job-schedule";
import { parseManifest } from "@/lib/plugins/manifest";
import { buildOrder, buildWhere, cleanData, collectionSpec, indexColumns, MAX_RECORD_BYTES } from "@/lib/plugins/record-query";
import { canPlugin, holdsGrantable, storedPermissions } from "@/lib/permissions";

const base = { id: "big-plugin", name: "Big plugin", version: "1.0.0" };

describe("manifest: collections, capabilities and jobs", () => {
  it("accepts a full big-plugin manifest", () => {
    const m = parseManifest(
      {
        ...base,
        collections: [{ name: "stock_moves", indexes: ["productId", "date"], numbers: ["qty", "value"] }],
        capabilities: [{ key: "stock.adjust", label: "Adjust stock", roles: ["ACCOUNTANT"] }],
        jobs: [{ id: "reorder", every: "daily" }],
        pages: [{ slug: "stock", title: "Stock", permission: "stock.adjust" }],
      },
      "CODE",
    );
    expect(m.collections[0]).toEqual({ name: "stock_moves", indexes: ["productId", "date"], numbers: ["qty", "value"] });
    expect(m.capabilities[0].roles).toEqual(["ACCOUNTANT"]);
    expect(m.jobs[0].every).toBe("daily");
  });

  it("rejects undeclared capabilities, duplicates, too many indexes and external tables", () => {
    expect(() => parseManifest({ ...base, pages: [{ slug: "x-page", title: "X", permission: "nope.read" }] }, "CODE")).toThrow(/not declared in capabilities/);
    expect(() => parseManifest({ ...base, collections: [{ name: "a" }, { name: "a" }] }, "CODE")).toThrow(/collection names must be unique/);
    expect(() => parseManifest({ ...base, collections: [{ name: "a", indexes: ["x", "x"] }] }, "CODE")).toThrow(/fields of collection .*a.* must be unique/);
    expect(() => parseManifest({ ...base, collections: [{ name: "a", indexes: ["a", "b", "c", "d", "e"] }] }, "CODE")).toThrow();
    expect(() => parseManifest({ ...base, collections: [{ name: "a" }] }, "EXTERNAL")).toThrow(/code plugins only/);
    expect(() => parseManifest({ ...base, capabilities: [{ key: "Bad Key", label: "x" }] }, "CODE")).toThrow();
  });

  it("knows the new events and their permissions", () => {
    expect(() => parseManifest({ ...base, events: ["purchase.cancelled"] }, "CODE")).toThrow(/purchases:read/);
    expect(() => parseManifest({ ...base, events: ["purchase_order.saved"], permissions: ["purchaseOrders:read"] }, "CODE")).not.toThrow();
    expect(() => parseManifest({ ...base, events: ["document.updated"], permissions: ["documents:read"] }, "CODE")).not.toThrow();
  });
});

describe("data tables: field mapping and queries", () => {
  const manifest = { collections: [{ name: "leads", indexes: ["stage", "ownerId", "search"], numbers: ["value"] }] };
  const spec = collectionSpec(manifest, "leads");

  it("maps declared fields to indexed columns", () => {
    expect(indexColumns(spec, { stage: "New", ownerId: 7, search: "", value: "1500.5", other: "x" })).toEqual({ i1: "New", i2: "7", i3: null, n1: 1500.5 });
    expect(() => indexColumns(spec, { stage: "x".repeat(192) })).toThrow(/longer than 191/);
    expect(() => indexColumns(spec, { value: "lots" })).toThrow(/must be a number/);
    expect(() => indexColumns(spec, { stage: { nested: true } })).toThrow(/must be text/);
    expect(() => collectionSpec(manifest, "deals")).toThrow(/not declared/);
  });

  it("builds where clauses only on declared fields", () => {
    expect(buildWhere(spec, { stage: "Won", value: { gte: 1000, lt: 5000 }, search: { contains: "acme" } })).toEqual({
      i1: { equals: "Won" },
      n1: { gte: 1000, lt: 5000 },
      i3: { contains: "acme" },
    });
    expect(buildWhere(spec, { ownerId: { in: ["a", "b"] }, stage: null, search: undefined })).toEqual({ i2: { in: ["a", "b"] }, i1: null });
    expect(buildWhere(spec, { id: { in: ["r1"] } })).toEqual({ id: { in: ["r1"] } });
    expect(() => buildWhere(spec, { notes: "x" })).toThrow(/add it to indexes or numbers/);
    expect(() => buildWhere(spec, { value: { contains: "1" } })).toThrow(/only works on text/);
    expect(() => buildWhere(spec, { stage: { like: "x" } as never })).toThrow(/Unknown filter/);
  });

  it("sorts newest first by default, with id breaking ties", () => {
    expect(buildOrder(spec)).toEqual([{ createdAt: "desc" }, { id: "asc" }]);
    expect(buildOrder(spec, "-value")).toEqual([{ n1: "desc" }, { id: "asc" }]);
    expect(buildOrder(spec, [{ field: "stage" }, "createdAt"])).toEqual([{ i1: "asc" }, { createdAt: "asc" }, { id: "asc" }]);
  });

  it("cleans records: plain objects, size-limited, system fields stripped", () => {
    expect(cleanData({ id: "x", createdAt: "y", name: "A", when: new Date("2026-01-01T00:00:00Z") })).toEqual({ name: "A", when: "2026-01-01T00:00:00.000Z" });
    expect(() => cleanData([1, 2])).toThrow(/must be an object/);
    expect(() => cleanData({ blob: "x".repeat(MAX_RECORD_BYTES) })).toThrow(/limited/);
  });
});

describe("plugin permissions in RBAC", () => {
  const caps = [
    { key: "leads.view", roles: ["OWNER", "ACCOUNTANT", "STAFF"] },
    { key: "leads.delete", roles: ["OWNER"] },
  ];
  const who = (keys: Array<string | null>, perms: string[] = []) => ({ roles: keys.map((key) => ({ key })), permissions: new Set(perms) });

  it("owners hold everything; built-in roles get the defaults; custom roles need the grant", () => {
    expect(canPlugin(who(["OWNER"]), "lm", caps, "leads.delete")).toBe(true);
    expect(canPlugin(who(["STAFF"]), "lm", caps, "leads.view")).toBe(true);
    expect(canPlugin(who(["STAFF"]), "lm", caps, "leads.delete")).toBe(false);
    expect(canPlugin(who([null]), "lm", caps, "leads.view")).toBe(false);
    expect(canPlugin(who([null], ["plugin:lm:leads.delete"]), "lm", caps, "leads.delete")).toBe(true);
    expect(canPlugin(who(["OWNER"]), "lm", caps, "undeclared")).toBe(false);
  });

  it("custom roles store plugin permissions, and only holders can grant them", () => {
    expect(storedPermissions(["plugin:lm:leads.view", "plugin:BAD", "app:lm", "nope"])).toEqual(["plugin:lm:leads.view", "app:lm"]);
    const map = new Map([["lm", caps]]);
    expect(holdsGrantable(who(["OWNER"]), "plugin:lm:leads.delete", map)).toBe(true);
    expect(holdsGrantable(who(["OWNER"]), "app:lm", map)).toBe(true);
    expect(holdsGrantable(who(["STAFF"]), "plugin:lm:leads.delete", map)).toBe(false);
    expect(holdsGrantable(who(["STAFF"]), "plugin:lm:leads.view", map)).toBe(true);
  });
});

describe("scheduled jobs", () => {
  const at = (iso: string) => new Date(iso);
  it("hourly jobs run once per clock hour", () => {
    expect(isJobDue("hourly", null, at("2026-11-18T03:00:00Z"))).toBe(true);
    expect(isJobDue("hourly", at("2026-11-18T03:31:00Z"), at("2026-11-18T03:59:00Z"))).toBe(false); // same IST hour (09:01–09:29)
    expect(isJobDue("hourly", at("2026-11-18T03:29:00Z"), at("2026-11-18T03:31:00Z"))).toBe(true); // 08:59 → 09:01 IST
  });
  it("daily jobs run once a day from 06:00 IST", () => {
    expect(isJobDue("daily", null, at("2026-11-18T00:00:00Z"))).toBe(false); // 05:30 IST
    expect(isJobDue("daily", null, at("2026-11-18T00:31:00Z"))).toBe(true); // 06:01 IST
    expect(isJobDue("daily", at("2026-11-18T00:31:00Z"), at("2026-11-18T15:00:00Z"))).toBe(false);
    expect(isJobDue("daily", at("2026-11-17T00:31:00Z"), at("2026-11-18T01:00:00Z"))).toBe(true);
  });
});

describe("form actions: CSRF and redirects", () => {
  const post = (headers: Record<string, string>) => new Request("http://localhost:3000/api/plugins/x/_action/y", { method: "POST", headers });

  it("accepts same-origin posts and refuses other sites", () => {
    expect(sameOrigin(post({ origin: "http://localhost:3000" }))).toBe(true);
    expect(sameOrigin(post({ origin: "https://app.mygst.app", "x-forwarded-host": "app.mygst.app" }))).toBe(true);
    expect(sameOrigin(post({ origin: "https://evil.example" }))).toBe(false);
    expect(sameOrigin(post({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(sameOrigin(post({}))).toBe(true);
  });

  it("only redirects inside the company", () => {
    expect(safeCompanyPath("c1", "/c/c1/apps/lm/leads")).toBe("/c/c1/apps/lm/leads");
    expect(safeCompanyPath("c1", "http://localhost:3000/c/c1/apps/lm/leads?x=1")).toBe("/c/c1/apps/lm/leads?x=1");
    expect(safeCompanyPath("c1", "/c/c2/apps/lm")).toBeNull();
    expect(safeCompanyPath("c1", "https://evil.example/c/c1/x")).toBe("/c/c1/x"); // host dropped, path kept
    expect(safeCompanyPath("c1", "//evil.example")).toBeNull();
    expect(withNotice("/c/c1/apps/lm/leads?q=a&_error=old", "_ok", "Saved")).toBe("/c/c1/apps/lm/leads?q=a&_ok=Saved");
  });
});
