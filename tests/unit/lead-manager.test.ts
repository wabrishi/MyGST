import { describe, expect, it } from "vitest";
import { createPluginTestContext, loadForTest } from "@/lib/plugins/testing";
import plugin from "@/plugins/lead-manager";
import { advanceTo, leadRef, neighbourStage, parseList, searchText, stagesFrom, type Lead } from "@/plugins/lead-manager/model";

const p = loadForTest(plugin);
const user = { id: "u1", name: "Asha", email: "asha@test.local" };
const make = (capabilities?: string[], extra: Parameters<typeof createPluginTestContext>[0]["data"] = {}) =>
  createPluginTestContext({
    manifest: p.manifest,
    user,
    role: "STAFF",
    capabilities,
    data: {
      members: async () => [{ userId: "u1", name: "Asha", email: "asha@test.local", roles: ["Staff"] }],
      company: async () => ({ id: "c", legalName: "Test", tradeName: "", gstin: "", stateCode: "27", address: "", city: "", pincode: "", phone: "", email: "" }),
      ...extra,
    },
  });

describe("Lead Manager: model", () => {
  it("stages: settings order, then Won and Lost", () => {
    expect(stagesFrom({ stages: "New, Hot\nProposal, Won" }).all).toEqual(["New", "Hot", "Proposal", "Won", "Lost"]);
    expect(stagesFrom({}).open).toEqual(["New", "Contacted", "Qualified", "Proposal"]);
    expect(parseList(" a, ,a,b ", ["x"])).toEqual(["a", "b"]);
    expect(neighbourStage(["A", "B", "C"], "B", 1)).toBe("C");
    expect(neighbourStage(["A", "B", "C"], "A", -1)).toBeNull();
  });
  it("a quotation only moves a lead forward to Proposal", () => {
    const open = ["New", "Contacted", "Proposal", "Negotiation"];
    expect(advanceTo(open, "New", "Proposal")).toBe("Proposal");
    expect(advanceTo(open, "Negotiation", "Proposal")).toBe("Negotiation");
    expect(advanceTo(open, "Won", "Proposal")).toBe("Won");
    expect(searchText({ name: "Ravi", company: "Acme", phone: "98", email: "R@X.IN" })).toBe("ravi acme 98 r@x.in");
  });
});

describe("Lead Manager: the plugin", () => {
  it("declares its pages, permissions, tables and job", () => {
    expect(p.manifest.pages.map((x) => x.slug)).toEqual(["pipeline", "leads", "follow-ups"]);
    expect(p.manifest.capabilities.map((c) => c.key)).toContain("leads.convert");
    expect([...p.formActions.keys()]).toContain("createLead");
    expect(p.jobs.has("digest")).toBe(true);
  });

  it("creates a lead with a follow-up, moves it and completes the follow-up", async () => {
    const ctx = make();
    const r = await p.runAction("createLead", { name: "Ravi Kumar", company: "Acme Steel", value: "50000", source: "Referral", followUp: "2099-01-10", followUpNote: "Call back" }, ctx);
    expect(r.message).toBe("Lead created");
    const [lead] = await ctx.db.collection<Lead>("leads").find();
    expect(lead).toMatchObject({ name: "Ravi Kumar", stage: "New", value: 50000, ownerId: "u1", nextFollowUp: "2099-01-10", search: "ravi kumar acme steel" });
    expect(r.redirect).toBe(ctx.pageUrl("leads", lead.id));

    await p.runAction("moveStage", { id: lead.id, dir: "next" }, ctx);
    expect((await ctx.db.collection<Lead>("leads").get(lead.id))!.stage).toBe("Contacted");

    const [fu] = await ctx.db.collection("activities").find({ where: { leadId: lead.id, kind: "followup" } });
    await p.runAction("completeFollowUp", { id: fu.id }, ctx);
    expect((await ctx.db.collection<Lead>("leads").get(lead.id))!.nextFollowUp).toBe("");
    expect(await ctx.db.collection("activities").count({ leadId: lead.id })).toBe(4); // created, follow-up, stage, done
  });

  it("checks input and permissions", async () => {
    const ctx = make(["leads.view", "leads.manage"]);
    expect((await p.runAction("createLead", { name: "" }, ctx)).error).toMatch(/name/);
    expect((await p.runAction("createLead", { name: "X", email: "nope" }, ctx)).error).toMatch(/email/);
    await p.runAction("createLead", { name: "X" }, ctx);
    const [lead] = await ctx.db.collection<Lead>("leads").find();
    expect((await p.runAction("deleteLead", { id: lead.id }, ctx)).error).toMatch(/permission/);
    expect((await p.runAction("convertLead", { id: lead.id }, ctx)).error).toMatch(/permission/);
  });

  it("staff only see their own leads", async () => {
    const ctx = make(["leads.view", "leads.manage"]);
    const other = await ctx.db.collection<Lead>("leads").insert({ name: "Someone else's", ownerId: "u2", stage: "New" } as Lead);
    expect((await p.runAction("moveStage", { id: other.id, dir: "next" }, ctx)).error).toBe("Lead not found");
  });

  it("converts to a customer, quotes, and follows the quotation and invoice events", async () => {
    const upserts: unknown[] = [];
    const quotes: unknown[] = [];
    const ctx = make(undefined, {
      parties: { upsert: async (b: unknown) => (upserts.push(b), { id: "party1", created: true }) },
      documents: { createQuotation: async (b: unknown) => (quotes.push(b), { id: "q1", number: "QT/26-27/0001", url: "", total: 1180 }) },
    });
    await p.runAction("createLead", { name: "Meera", company: "Blue Ltd", gstin: "29ABCDE1234F1Z5" }, ctx);
    const [lead] = await ctx.db.collection<Lead>("leads").find();

    expect((await p.runAction("convertLead", { id: lead.id }, ctx)).message).toBe("Customer created");
    expect(upserts[0]).toMatchObject({ name: "Blue Ltd", stateCode: "29", externalRef: leadRef(lead.id) });

    await p.runAction("quickQuotation", { id: lead.id, item: "AMC", qty: "1", rate: "1000", gstRate: "18" }, ctx);
    expect(quotes[0]).toMatchObject({ partyId: "party1", leadRef: leadRef(lead.id), items: [{ name: "AMC", qty: 1, rate: 1000, gstRate: 18 }] });

    const bg = createPluginTestContext({ manifest: p.manifest });
    bg.records.set("leads", ctx.records.get("leads")!);
    bg.records.set("activities", ctx.records.get("activities")!);
    await p.emit("quotation.created", { id: "q1", number: "QT/26-27/0001", total: 1180, partyId: "party1", leadRef: leadRef(lead.id) }, bg);
    let l = (await bg.db.collection<Lead>("leads").get(lead.id))!;
    expect(l.stage).toBe("Proposal");
    expect(l.quotations).toHaveLength(1);

    await p.emit("invoice.issued", { id: "i1", number: "INV/1", total: 1180, partyId: "party1" }, bg);
    l = (await bg.db.collection<Lead>("leads").get(lead.id))!;
    expect(l.stage).toBe("Won");
  });

  it("the daily digest emails each owner their due follow-ups", async () => {
    const ctx = make();
    await p.runAction("createLead", { name: "Due lead", followUp: "2099-01-01" }, ctx);
    const acts = ctx.db.collection("activities");
    const [fu] = await acts.find({ where: { kind: "followup" } });
    await acts.update(fu.id, { dueAt: "2000-01-01" }); // overdue
    const bg = createPluginTestContext({ manifest: p.manifest, settings: { digest: true } });
    bg.records.set("leads", ctx.records.get("leads")!);
    bg.records.set("activities", ctx.records.get("activities")!);
    await p.runJob("digest", bg);
    expect(bg.mails).toHaveLength(1);
    expect(bg.mails[0]).toMatchObject({ toUserIds: ["u1"], subject: "1 follow-up due today" });
    expect(bg.mails[0].html).toContain("Due lead");
  });
});
