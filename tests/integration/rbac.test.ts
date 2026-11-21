import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminAudit, adminGrants } from "@/lib/admin";
import { PLATFORM_ROLE_ID } from "@/lib/admin-permissions";
import { platformOverview } from "@/lib/admin-stats";
import { db } from "@/lib/db";
import { saveDocument } from "@/lib/documents";
import { todayIST } from "@/lib/gst/fy";
import { BUILTIN_ROLE_ID } from "@/lib/permissions";
import { installPlugin, previewUpload, saveUpload, setCompanyAccess, uninstallPlugin } from "@/lib/plugins/manage";
import { activeEntries, applyFilters } from "@/lib/plugins/runner";
import { bundleSha256 } from "@/lib/plugins/uploaded";
import { ownerCount, setMemberRoles, validRoleIds } from "@/lib/roles";
import type { CompanyContext } from "@/lib/tenant";
import { memberContext } from "./helpers";

/** Company + platform RBAC, admin audit/overview and uploaded plugins against the real database. */
describe("rbac & admin console", () => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const UPLOAD_ID = `up-${stamp}`.slice(0, 40);
  const companies: string[] = [];
  const users: string[] = [];

  const person = async (tag: string) => {
    const u = await db.user.create({ data: { id: `rbac-${tag}-${stamp}`, name: `RBAC ${tag}`, email: `rbac-${tag}-${stamp}@test.local` } });
    users.push(u.id);
    return u;
  };
  const company = async (name: string) => {
    const c = await db.company.create({ data: { legalName: `${name} ${stamp}`, stateCode: "27", address: "Pune" } });
    companies.push(c.id);
    return c;
  };

  let owner: CompanyContext;
  let co: Awaited<ReturnType<typeof company>>;

  beforeAll(async () => {
    process.env.BACKUP_ENCRYPTION_KEY ??= process.env.BETTER_AUTH_SECRET;
    co = await company("RBAC Co");
    owner = await memberContext(await person("owner"), co);
  });

  afterAll(async () => {
    await db.plugin.deleteMany({ where: { id: UPLOAD_ID } });
    await db.platformAuditLog.deleteMany({ where: { actorId: { in: users } } });
    await db.company.deleteMany({ where: { id: { in: companies } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });

  it("a member with two roles gets both roles' permissions", async () => {
    const lead = await db.companyRole.create({ data: { id: `crole_${stamp}`, companyId: co.id, name: "Team lead", permissions: ["company.users", "reports.view"] } });
    const ctx = await memberContext(await person("lead"), co, ["STAFF", lead.id]);
    expect(ctx.roles.map((r) => r.name).sort()).toEqual(["Staff", "Team lead"]);
    expect(ctx.role).toBe("STAFF");
    expect(ctx.permissions.has("docs.create")).toBe(true);
    expect(ctx.permissions.has("company.users")).toBe(true);
    expect(ctx.permissions.has("payments.write")).toBe(false);
  });

  it("role ids must be built-in or this company's own", async () => {
    const other = await company("Other Co");
    const foreign = await db.companyRole.create({ data: { id: `crole_f_${stamp}`, companyId: other.id, name: "Foreign", permissions: ["docs.create"] } });
    await expect(validRoleIds(co.id, [foreign.id])).rejects.toThrow(/doesn't exist/);
    await expect(validRoleIds(co.id, [])).rejects.toThrow(/at least one role/);
    expect(await validRoleIds(co.id, [BUILTIN_ROLE_ID.STAFF, BUILTIN_ROLE_ID.STAFF])).toEqual([BUILTIN_ROLE_ID.STAFF]);
  });

  it("the last Owner can't lose the Owner role", async () => {
    expect(await ownerCount(co.id)).toBe(1);
    await expect(db.$transaction((tx) => setMemberRoles(tx, co.id, owner.membershipId, [BUILTIN_ROLE_ID.STAFF]))).rejects.toThrow(/at least one Owner/);
    const second = await memberContext(await person("owner2"), co, ["OWNER"]);
    const change = await db.$transaction((tx) => setMemberRoles(tx, co.id, second.membershipId, [BUILTIN_ROLE_ID.ACCOUNTANT, BUILTIN_ROLE_ID.STAFF]));
    expect(change.next.sort()).toEqual([BUILTIN_ROLE_ID.ACCOUNTANT, BUILTIN_ROLE_ID.STAFF]);
    expect(await ownerCount(co.id)).toBe(1);
  });

  it("platform roles combine, and SUPER_ADMIN_EMAILS is always a full admin", async () => {
    const u = await person("support");
    await db.platformRoleAssignment.createMany({ data: [{ userId: u.id, roleId: PLATFORM_ROLE_ID.SUPPORT }, { userId: u.id, roleId: PLATFORM_ROLE_ID.VIEWER }] });
    const g = await adminGrants(u.id, u.email);
    expect(g.permissions.has("users.manage")).toBe(true); // Support
    expect(g.permissions.has("system.view")).toBe(true); // Viewer
    expect(g.permissions.has("plugins.upload")).toBe(false);
    expect(g.breakGlass).toBe(false);

    const prev = process.env.SUPER_ADMIN_EMAILS;
    process.env.SUPER_ADMIN_EMAILS = `someone@else.test, ${u.email.toUpperCase()}`;
    try {
      const all = await adminGrants(`${u.id}`, u.email); // cache is per request; new args → fresh
      expect(all.breakGlass).toBe(true);
      expect(all.permissions.has("plugins.upload")).toBe(true);
    } finally {
      process.env.SUPER_ADMIN_EMAILS = prev;
    }
  });

  it("admin actions are written to the platform audit log", async () => {
    const u = await person("auditor");
    await adminAudit({ user: { id: u.id, name: u.name, email: u.email } }, "test.action", "company", co.id, { ok: true });
    const row = await db.platformAuditLog.findFirst({ where: { actorId: u.id } });
    expect(row).toMatchObject({ action: "test.action", targetType: "company", targetId: co.id, actorEmail: u.email });
  });

  it("disabling a user blocks new sessions", async () => {
    const { auth } = await import("@/lib/auth");
    const email = `rbac-login-${stamp}@test.local`;
    const created = await auth.api.signUpEmail({ body: { name: "Login Test", email, phone: "98765 43210", password: "Passw0rd!123" } });
    users.push(created.user.id);
    await auth.api.signInEmail({ body: { email, password: "Passw0rd!123" } }); // works while enabled
    await db.user.update({ where: { id: created.user.id }, data: { disabledAt: new Date() } });
    await expect(auth.api.signInEmail({ body: { email, password: "Passw0rd!123" } })).rejects.toThrow(/disabled/i);
  });

  it("platform overview aggregates run on this database", async () => {
    await saveDocument(owner, "INVOICE", null, {
      partyId: (await db.party.create({ data: { companyId: co.id, name: "Buyer", stateCode: "27", gstin: "" } })).id,
      date: todayIST(),
      placeOfSupply: "27",
      notes: "",
      items: [{ description: "Work", qty: 1, rate: 1000, gstRate: 18 }],
    });
    const s = await platformOverview();
    expect(s.invoicesPerMonth).toHaveLength(12);
    expect(s.signupsPerWeek).toHaveLength(12);
    expect(s.invoicesPerMonth[11].value).toBeGreaterThanOrEqual(1);
    expect(s.salesPerMonth[11].value).toBeGreaterThanOrEqual(1180);
    expect(s.companies.total).toBeGreaterThanOrEqual(1);
  });

  it("an uploaded plugin installs and runs its hooks like a built-in one", async () => {
    const bundle = `
const sdk = require("@/lib/plugins/sdk");
module.exports.default = sdk.definePlugin({
  manifest: { id: ${JSON.stringify(UPLOAD_ID)}, name: "Upload test", version: "1.0.0", filters: ["pdf.sections"] },
  setup(api) { api.filter("pdf.sections", (v) => [...v, { title: "From upload", lines: ["ok"] }]); },
});`;
    const preview = await previewUpload(bundle);
    expect(preview).toMatchObject({ id: UPLOAD_ID, version: "1.0.0", existingVersion: null, sha256: bundleSha256(bundle) });
    await expect(saveUpload(bundle, { by: "test", expectSha256: "wrong", allowDowngrade: false })).rejects.toThrow(/changed after the preview/);
    await saveUpload(bundle, { by: "test", expectSha256: preview.sha256, allowDowngrade: false });

    await installPlugin(UPLOAD_ID, { availability: "SELECTED", defaultEnabled: true, by: "test" });
    await setCompanyAccess(UPLOAD_ID, co.id, { allowed: true });
    const entry = (await activeEntries(co.id)).find((e) => e.plugin.id === UPLOAD_ID);
    expect(entry?.code?.filters.has("pdf.sections")).toBe(true);
    expect(entry?.plugin).not.toHaveProperty("bundle"); // the big column isn't loaded per request

    const doc = { id: "d", type: "INVOICE", number: "X", date: todayIST(), status: "ISSUED", partyId: "p", partyName: "P", partyGstin: "", grandTotal: 1, customFields: {} };
    const out = await applyFilters({ companyId: co.id }, "pdf.sections", [], { document: doc as never });
    expect(out).toEqual([{ title: "From upload", lines: ["ok"] }]);

    // An older version is refused without the downgrade flag; a newer one upgrades in place.
    const v09 = bundle.replace('"1.0.0"', '"0.9.0"');
    await expect(saveUpload(v09, { by: "test", expectSha256: bundleSha256(v09), allowDowngrade: false })).rejects.toThrow(/older/);
    const v11 = bundle.replace('"1.0.0"', '"1.1.0"');
    await saveUpload(v11, { by: "test", expectSha256: bundleSha256(v11), allowDowngrade: false });
    expect((await db.plugin.findUniqueOrThrow({ where: { id: UPLOAD_ID } })).version).toBe("1.1.0");

    await uninstallPlugin(UPLOAD_ID, { keepData: false });
    expect(await db.plugin.findUnique({ where: { id: UPLOAD_ID } })).toBeNull();
  });
});
