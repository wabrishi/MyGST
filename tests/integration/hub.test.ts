import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveDocument } from "@/lib/documents";
import { todayIST } from "@/lib/gst/fy";
import { handleHubEvent, syncFromClaims, type SuiteClaims } from "@/lib/hub";
import type { CompanyContext } from "@/lib/tenant";

/** AUTH_MODE=hub sync, events and entitlement enforcement against the real database. */
describe("suite Hub integration", () => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const ws = `ws_${stamp}`;
  const ws2 = `ws2_${stamp}`;
  const users: string[] = [];
  const prevMode = process.env.AUTH_MODE;
  const future = new Date(Date.now() + 30 * 864e5).toISOString();
  const gst = (limits: Record<string, number>, over: Record<string, unknown> = {}) => ({
    plan: "Basic",
    status: "ACTIVE" as const,
    active: true,
    validUntil: future,
    accessUntil: future,
    limits,
    ...over,
  });
  const claims = (email: string, over: Partial<SuiteClaims> = {}): SuiteClaims => ({
    sub: email,
    email,
    ws,
    ws_name: "Hub Traders",
    role: "OWNER",
    modules: { gst: gst({ users: 2, invoicesPerMonth: 1 }) },
    ...over,
  });
  const makeUser = async (tag: string) => {
    const u = await db.user.create({ data: { id: `hub-${tag}-${stamp}`, name: tag, email: `hub-${tag}-${stamp}@test.local` } });
    users.push(u.id);
    return u;
  };

  beforeAll(() => {
    process.env.AUTH_MODE = "hub";
  });

  afterAll(async () => {
    process.env.AUTH_MODE = prevMode;
    const companies = await db.company.findMany({ where: { OR: [{ hubWorkspaceId: { in: [ws, ws2] } }, { legalName: `Pre-Hub ${stamp}` }] } });
    for (const c of companies) {
      await db.document.deleteMany({ where: { companyId: c.id } });
      await db.company.delete({ where: { id: c.id } });
    }
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });

  let companyId = "";

  it("first sign-in creates the company from the workspace and an owner membership", async () => {
    const owner = await makeUser("owner");
    const r = await syncFromClaims(owner.id, claims(owner.email));
    expect(r.notice).toBeNull();
    const c = await db.company.findUniqueOrThrow({ where: { hubWorkspaceId: ws } });
    companyId = c.id;
    expect(r.companyId).toBe(c.id);
    expect(c).toMatchObject({ legalName: "Hub Traders", createdVia: "HUB", stateCode: "" });
    expect(c.entitlement).toMatchObject({ plan: "Basic", limits: { invoicesPerMonth: 1 } });
    expect(await db.membership.findUniqueOrThrow({ where: { userId: owner.id } })).toMatchObject({ companyId: c.id, role: "OWNER" });

    // Re-sign-in with a new Hub role updates it.
    await syncFromClaims(owner.id, claims(owner.email, { role: "MANAGER" }));
    expect((await db.membership.findUniqueOrThrow({ where: { userId: owner.id } })).role).toBe("ACCOUNTANT");
    await syncFromClaims(owner.id, claims(owner.email));
  });

  it("links a pre-Hub company named in tenants.gst instead of creating one", async () => {
    const pre = await db.company.create({ data: { legalName: `Pre-Hub ${stamp}`, stateCode: "27" } });
    const u = await makeUser("pre");
    await db.membership.create({ data: { userId: u.id, companyId: pre.id, role: "OWNER" } });
    const r = await syncFromClaims(u.id, claims(u.email, { ws: ws2, tenants: { gst: pre.id } }));
    expect(r).toEqual({ companyId: pre.id, notice: null });
    expect((await db.company.findUniqueOrThrow({ where: { id: pre.id } })).hubWorkspaceId).toBe(ws2);
  });

  it("keeps one company per user: a different workspace doesn't move the membership, it sets a notice", async () => {
    const u = users[1]; // belongs to the pre-Hub company (ws2)
    const email = (await db.user.findUniqueOrThrow({ where: { id: u } })).email;
    const r = await syncFromClaims(u, claims(email, { role: "MEMBER" }));
    expect(r.notice).toMatch(/only one company/);
    expect((await db.membership.findUniqueOrThrow({ where: { userId: u } })).companyId).not.toBe(companyId);
    expect((await db.user.findUniqueOrThrow({ where: { id: u } })).hubNotice).toMatch(/only one company/);
  });

  it("enforces the users limit on new memberships", async () => {
    const staff = await makeUser("staff");
    expect((await syncFromClaims(staff.id, claims(staff.email, { role: "MEMBER" }))).notice).toBeNull(); // 2 of 2
    const extra = await makeUser("extra");
    const r = await syncFromClaims(extra.id, claims(extra.email, { role: "MEMBER" }));
    expect(r.notice).toMatch(/allows 2 users/);
    expect(await db.membership.findUnique({ where: { userId: extra.id } })).toBeNull();
  });

  it("blocks documents until setup, then enforces the monthly invoice limit and expiry", async () => {
    const owner = await db.user.findUniqueOrThrow({ where: { id: users[0] } });
    const ctx: CompanyContext = {
      user: { id: owner.id, name: owner.name, email: owner.email },
      companyId,
      role: "OWNER",
      company: { id: companyId, legalName: "Hub Traders", tradeName: "", stateCode: "27", gstin: "" },
    };
    const party = await db.party.create({ data: { companyId, name: "Buyer", stateCode: "27" } });
    const doc = { partyId: party.id, date: todayIST(), placeOfSupply: "27", items: [{ description: "Work", qty: 1, rate: 1000, gstRate: 18 }] };

    await expect(saveDocument(ctx, "INVOICE", null, doc)).rejects.toThrow(/Finish company setup/);
    await db.company.update({ where: { id: companyId }, data: { stateCode: "27", address: "Pune" } });

    const first = await saveDocument(ctx, "INVOICE", null, doc);
    expect(first).toBeTruthy();
    await expect(saveDocument(ctx, "INVOICE", null, doc)).rejects.toThrow(/allows 1 invoices per month/);
    // Quotations don't count against the invoice limit.
    expect(await saveDocument(ctx, "QUOTATION", null, doc)).toBeTruthy();
    // Editing an existing invoice is still allowed.
    expect(await saveDocument(ctx, "INVOICE", first, { ...doc, notes: "edited" })).toBe(first);

    // subscription.updated -> expired: everything new is blocked.
    const past = new Date(Date.now() - 864e5).toISOString();
    await handleHubEvent({ id: `evt_exp_${stamp}`, type: "subscription.updated", workspaceId: ws, data: { module: "gst", entitlement: gst({}, { status: "EXPIRED", active: false, validUntil: past, accessUntil: past }) } });
    await expect(saveDocument(ctx, "QUOTATION", null, doc)).rejects.toThrow(/subscription has ended/);
  });

  it("handles Hub events once: subscription, suspension, role change, removal", async () => {
    const ev = { id: `evt_up_${stamp}`, type: "subscription.updated", workspaceId: ws, data: { module: "gst", entitlement: gst({ invoicesPerMonth: -1 }) } };
    expect(await handleHubEvent(ev)).toBe(true);
    expect(await handleHubEvent(ev)).toBe(false); // duplicate
    expect((await db.company.findUniqueOrThrow({ where: { id: companyId } })).entitlement).toMatchObject({ limits: { invoicesPerMonth: -1 } });

    // Other modules' subscriptions are ignored.
    await handleHubEvent({ id: `evt_leads_${stamp}`, type: "subscription.updated", workspaceId: ws, data: { module: "leads", entitlement: null } });
    expect((await db.company.findUniqueOrThrow({ where: { id: companyId } })).entitlement).not.toBeNull();

    await handleHubEvent({ id: `evt_susp_${stamp}`, type: "workspace.suspended", workspaceId: ws, data: { status: "SUSPENDED" } });
    expect((await db.company.findUniqueOrThrow({ where: { id: companyId } })).suspendedAt).not.toBeNull();
    await handleHubEvent({ id: `evt_act_${stamp}`, type: "workspace.updated", workspaceId: ws, data: { status: "ACTIVE", name: "Renamed" } });
    const c = await db.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(c.suspendedAt).toBeNull();
    expect(c.legalName).toBe("Renamed"); // setup not finished -> Hub name still applies

    const staff = await db.user.findUniqueOrThrow({ where: { id: users[2] } });
    await handleHubEvent({ id: `evt_mu_${stamp}`, type: "member.updated", workspaceId: ws, data: { email: staff.email.toUpperCase(), role: "MANAGER" } });
    expect((await db.membership.findUniqueOrThrow({ where: { userId: staff.id } })).role).toBe("ACCOUNTANT");

    await db.session.create({ data: { id: `s-${stamp}`, token: `t-${stamp}`, userId: staff.id, expiresAt: new Date(Date.now() + 864e5) } });
    await handleHubEvent({ id: `evt_mr_${stamp}`, type: "member.removed", workspaceId: ws, data: { email: staff.email } });
    expect(await db.membership.findUnique({ where: { userId: staff.id } })).toBeNull();
    expect(await db.session.count({ where: { userId: staff.id } })).toBe(0);

    // A GST subscription for a workspace never seen before creates its company.
    await handleHubEvent({ id: `evt_new_${stamp}`, type: "subscription.updated", workspaceId: `${ws}_new`, data: { module: "gst", workspace: { name: "Fresh Co" }, entitlement: gst({}) } });
    const fresh = await db.company.findUniqueOrThrow({ where: { hubWorkspaceId: `${ws}_new` } });
    expect(fresh.legalName).toBe("Fresh Co");
    await db.company.delete({ where: { id: fresh.id } });
  });
});
