import "dotenv/config";
import { describe, expect, it } from "vitest";
import { BUILTIN_ADMIN_PERMISSIONS, platformRolePermissions, storedAdminPermissions } from "@/lib/admin-permissions";
import { fillSeries, lastMonths, lastWeeks } from "@/lib/admin-stats";
import { BUILTIN_PERMISSIONS, can, canAny, canUseApp, primaryRole, resolvePermissions, roleNames, storedPermissions } from "@/lib/permissions";
import { evaluateBundle, loadBundle } from "@/lib/plugins/uploaded";

const owner = { id: "role_owner", key: "OWNER", name: "Owner" };
const accountant = { id: "role_accountant", key: "ACCOUNTANT", name: "Accountant" };
const staff = { id: "role_staff", key: "STAFF", name: "Staff" };
const custom = (permissions: unknown) => ({ id: "crole_x", key: null, name: "Team lead", permissions });

describe("company RBAC", () => {
  it("built-in roles keep their old meaning", () => {
    const s = { permissions: resolvePermissions([staff]) };
    expect(can(s, "docs.create")).toBe(true);
    expect(can(s, "reports.view")).toBe(false);
    expect(can(s, "docs.viewAll")).toBe(false);
    const a = { permissions: resolvePermissions([accountant]) };
    expect(can(a, "payments.write")).toBe(true);
    expect(can(a, "company.settings")).toBe(false);
    expect(BUILTIN_PERMISSIONS.OWNER.length).toBeGreaterThan(BUILTIN_PERMISSIONS.ACCOUNTANT.length);
  });

  it("several roles give the union of their permissions", () => {
    const g = { permissions: resolvePermissions([staff, custom(["company.users", "reports.view"])]) };
    expect(can(g, "docs.create")).toBe(true); // from Staff
    expect(can(g, "company.users")).toBe(true); // from the custom role
    expect(can(g, "reports.view")).toBe(true);
    expect(can(g, "payments.write")).toBe(false); // from neither
    expect(canAny(g, ["payments.write", "company.users"])).toBe(true);
  });

  it("custom roles keep only known permissions", () => {
    expect(storedPermissions(["docs.create", "nope", 42, "app:po-number", "app:Bad Id"])).toEqual(["docs.create", "app:po-number"]);
    expect(storedPermissions("docs.create")).toEqual([]);
    expect(resolvePermissions([{ id: "x", key: null, name: "x", permissions: null }]).size).toBe(0);
  });

  it("primary role is the highest built-in role held", () => {
    expect(primaryRole([staff, owner])).toBe("OWNER");
    expect(primaryRole([staff, custom([])])).toBe("STAFF");
    expect(primaryRole([custom(["docs.create"])])).toBeNull();
    expect(roleNames([owner, custom([])])).toBe("Owner, Team lead");
  });

  it("plugin pages: a listed built-in role or the app:<id> permission", () => {
    const viaRole = { roles: [accountant], permissions: resolvePermissions([accountant]) };
    expect(canUseApp(viaRole, "po-number", ["OWNER", "ACCOUNTANT"])).toBe(true);
    expect(canUseApp(viaRole, "po-number", ["OWNER"])).toBe(false);
    const viaApp = { roles: [custom(["app:po-number"])], permissions: resolvePermissions([custom(["app:po-number"])]) };
    expect(canUseApp(viaApp, "po-number", ["OWNER"])).toBe(true);
    expect(canUseApp(viaApp, "other-plugin", ["OWNER"])).toBe(false);
  });
});

describe("platform RBAC", () => {
  it("built-in platform roles", () => {
    expect(platformRolePermissions({ key: "SUPPORT" })).toContain("users.manage");
    expect(platformRolePermissions({ key: "SUPPORT" })).not.toContain("plugins.upload");
    expect(platformRolePermissions({ key: "VIEWER" })).toEqual(BUILTIN_ADMIN_PERMISSIONS.VIEWER);
  });
  it("custom platform roles keep only known permissions", () => {
    expect(storedAdminPermissions(["audit.view", "docs.create", "x"])).toEqual(["audit.view"]);
    expect(platformRolePermissions({ key: null, permissions: ["system.view"] })).toEqual(["system.view"]);
  });
});

describe("admin overview buckets", () => {
  it("12 months ending this month, oldest first", () => {
    const m = lastMonths("2026-11-17", 12);
    expect(m).toHaveLength(12);
    expect(m[0]).toEqual({ key: "2025-12", label: "Dec 25" });
    expect(m[11]).toEqual({ key: "2026-11", label: "Nov 26" });
  });
  it("weeks start on Monday", () => {
    const w = lastWeeks("2026-11-17", 3); // Tuesday
    expect(w.map((x) => x.key)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });
  it("missing buckets are zero; Date keys are matched by day", () => {
    const s = fillSeries(lastWeeks("2026-11-17", 2), [{ k: new Date("2026-11-16T00:00:00Z"), v: BigInt(3) }]);
    expect(s.map((p) => p.value)).toEqual([0, 3]);
  });
});

const BUNDLE = `
const sdk = require("@/lib/plugins/sdk");
const { jsx } = require("react/jsx-runtime");
module.exports.default = sdk.definePlugin({
  manifest: { id: "unit-upload", name: "Unit upload", version: "1.2.0", filters: ["pdf.sections"], widgets: [{ id: "hello", title: "Hello" }] },
  setup(api) {
    api.filter("pdf.sections", (v) => [...v, { title: "Uploaded", lines: ["hi"] }]);
    api.widget("hello", () => jsx("p", { children: "hello" }));
  },
});`;

describe("uploaded plugin bundles", () => {
  it("loads and validates a packed bundle", () => {
    const p = loadBundle(BUNDLE);
    expect(p.manifest.id).toBe("unit-upload");
    expect(p.filters.get("pdf.sections")).toHaveLength(1);
    expect(p.widgets.has("hello")).toBe(true);
    expect(p.folder).toBe("upload:unit-upload");
  });
  it("refuses imports other than react and the SDK", () => {
    expect(() => evaluateBundle(`require("@/lib/db");`)).toThrow(/can only import react/);
    expect(() => evaluateBundle(`require("fs");`)).toThrow(/can only import react/);
  });
  it("refuses a bundle for another id, a bad manifest, and oversized files", () => {
    expect(() => loadBundle(BUNDLE, "other-id")).toThrow(/not "other-id"/);
    expect(() => loadBundle(`module.exports.default = { manifest: { id: "x" }, setup() {} };`)).toThrow();
    expect(() => evaluateBundle("//" + "x".repeat(2 * 1024 * 1024 + 1))).toThrow(/2 MB/);
  });
});
