import { PluginError, type FormActionResult, type PluginContext } from "@/lib/plugins/sdk";
import {
  ACTIVITY_LABEL,
  canSee,
  isClosed,
  isoOrEmpty,
  leadRef,
  LOST,
  neighbourStage,
  parseList,
  DEFAULT_SOURCES,
  searchText,
  stagesFrom,
  todayIST,
  WON,
  type Activity,
  type ActivityKind,
  type Lead,
  type LeadRecord,
} from "./model";

/** <ActionForm> handlers. Each one checks the user may see the lead it touches. */

const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);

export const leads = (ctx: PluginContext) => ctx.db.collection<Lead>("leads");
export const activities = (ctx: PluginContext) => ctx.db.collection<Activity>("activities");

async function visibleLead(ctx: PluginContext, id: string): Promise<LeadRecord> {
  const lead = id ? await leads(ctx).get(id) : null;
  if (!lead || !canSee(ctx, lead)) throw new PluginError("Lead not found");
  return lead;
}

/** Adds an entry to the lead's timeline. */
export async function logActivity(ctx: PluginContext, leadId: string, kind: ActivityKind, body: string, extra: Partial<Activity> = {}) {
  await activities(ctx).insert({ leadId, kind, text: body.slice(0, 2000), dueAt: "", open: "no", ownerId: ctx.user?.id ?? "", byName: ctx.user?.name ?? "Lead Manager", ...extra });
}

/** Keeps lead.nextFollowUp = the earliest open follow-up. */
export async function refreshNextFollowUp(ctx: PluginContext, leadId: string) {
  const [earliest] = await activities(ctx).find({ where: { leadId, kind: "followup", open: "yes" }, orderBy: "dueAt", limit: 1 });
  await leads(ctx).update(leadId, { nextFollowUp: earliest?.dueAt ?? "" });
}

async function members(ctx: PluginContext) {
  return ctx.data.members().catch(() => []);
}

function readLeadForm(ctx: PluginContext, form: FormData) {
  const name = text(form, "name", 120);
  if (!name) throw new PluginError("Enter the lead's name");
  const email = text(form, "email", 150);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PluginError("That email address doesn't look right");
  const value = Number(text(form, "value", 20) || 0);
  if (!Number.isFinite(value) || value < 0) throw new PluginError("Deal value must be a positive number");
  const sources = parseList(ctx.settings.sources, DEFAULT_SOURCES);
  const source = text(form, "source", 40);
  return {
    name,
    company: text(form, "company", 120),
    phone: text(form, "phone", 30),
    email,
    gstin: text(form, "gstin", 15).toUpperCase(),
    source: sources.includes(source) ? source : "",
    value: Math.round(value * 100) / 100,
    notes: text(form, "notes", 2000),
  };
}

async function ownerFrom(ctx: PluginContext, form: FormData, fallback: { ownerId: string; ownerName: string }) {
  const wanted = text(form, "ownerId", 64);
  if (!wanted || wanted === fallback.ownerId) return fallback;
  // Only people who see every lead may hand a lead to someone else.
  if (!ctx.can("leads.viewAll")) return fallback;
  const m = (await members(ctx)).find((x) => x.userId === wanted);
  return m ? { ownerId: m.userId, ownerName: m.name } : fallback;
}

export async function createLead(form: FormData, ctx: PluginContext): Promise<FormActionResult> {
  const data = readLeadForm(ctx, form);
  const { open } = stagesFrom(ctx.settings);
  const me = { ownerId: ctx.user?.id ?? "", ownerName: ctx.user?.name ?? "" };
  const owner = await ownerFrom(ctx, form, me);
  const lead = await leads(ctx).insert({
    ...data,
    ...owner,
    stage: open[0],
    nextFollowUp: "",
    search: searchText(data),
    partyId: "",
    quotations: [],
    closedAt: "",
    lostReason: "",
  });
  await logActivity(ctx, lead.id, "system", `Lead created${data.source ? ` (source: ${data.source})` : ""}`);
  const due = isoOrEmpty(form.get("followUp"));
  if (due) {
    await logActivity(ctx, lead.id, "followup", text(form, "followUpNote", 300) || "First follow-up", { dueAt: due, open: "yes", ownerId: owner.ownerId });
    await refreshNextFollowUp(ctx, lead.id);
  }
  return { redirect: ctx.pageUrl("leads", lead.id), message: "Lead created" };
}

export async function updateLead(form: FormData, ctx: PluginContext): Promise<FormActionResult> {
  const lead = await visibleLead(ctx, text(form, "id", 64));
  const data = readLeadForm(ctx, form);
  const owner = await ownerFrom(ctx, form, { ownerId: lead.ownerId, ownerName: lead.ownerName });
  await leads(ctx).update(lead.id, { ...data, ...owner, search: searchText(data) });
  if (owner.ownerId !== lead.ownerId) await logActivity(ctx, lead.id, "system", `Assigned to ${owner.ownerName}`);
  return { redirect: ctx.pageUrl("leads", lead.id), message: "Lead saved" };
}

export async function moveStage(form: FormData, ctx: PluginContext): Promise<FormActionResult> {
  const lead = await visibleLead(ctx, text(form, "id", 64));
  const { open, all } = stagesFrom(ctx.settings);
  const dir = text(form, "dir", 4);
  const target = dir === "next" ? neighbourStage(open, lead.stage, 1) : dir === "prev" ? neighbourStage(open, lead.stage, -1) : text(form, "stage", 40);
  if (!target || !all.includes(target)) throw new PluginError("Choose a valid stage");
  if (target === lead.stage) return {};
  const reason = target === LOST ? text(form, "reason", 300) : "";
  await leads(ctx).update(lead.id, { stage: target, closedAt: isClosed(target) ? todayIST() : "", lostReason: reason });
  await logActivity(ctx, lead.id, "system", `Stage: ${lead.stage} → ${target}${reason ? ` (${reason})` : ""}`);
  return { message: target === WON ? `${lead.name} marked as won 🎉` : `${lead.name} moved to ${target}` };
}

export async function addActivity(form: FormData, ctx: PluginContext): Promise<FormActionResult> {
  const lead = await visibleLead(ctx, text(form, "leadId", 64));
  const kind = text(form, "kind", 20) as ActivityKind;
  if (!(kind in ACTIVITY_LABEL) || kind === "system") throw new PluginError("Choose what kind of activity this is");
  const body = text(form, "text", 2000);
  if (kind === "followup") {
    const due = isoOrEmpty(form.get("dueAt"));
    if (!due) throw new PluginError("Pick a date for the follow-up");
    await logActivity(ctx, lead.id, "followup", body || "Follow up", { dueAt: due, open: "yes", ownerId: lead.ownerId });
    await refreshNextFollowUp(ctx, lead.id);
    return { message: `Follow-up set for ${due}` };
  }
  if (!body) throw new PluginError("Write what happened");
  await logActivity(ctx, lead.id, kind, body);
  return { message: `${ACTIVITY_LABEL[kind]} added` };
}

export async function completeFollowUp(form: FormData, ctx: PluginContext): Promise<FormActionResult> {
  const a = await activities(ctx).get(text(form, "id", 64));
  if (!a || a.kind !== "followup") throw new PluginError("Follow-up not found");
  await visibleLead(ctx, a.leadId);
  if (a.open === "yes") {
    await activities(ctx).update(a.id, { open: "no" });
    await logActivity(ctx, a.leadId, "system", `Follow-up done: ${a.text}`);
    await refreshNextFollowUp(ctx, a.leadId);
  }
  return { message: "Follow-up done" };
}

/** Creates (or finds) the MyGST customer for this lead. */
export async function convertLead(form: FormData, ctx: PluginContext): Promise<FormActionResult> {
  const lead = await visibleLead(ctx, text(form, "id", 64));
  if (lead.partyId) return { message: "Already a customer" };
  const company = await ctx.data.company();
  const state = /^\d{2}/.test(lead.gstin) ? lead.gstin.slice(0, 2) : company.stateCode;
  const { id: partyId, created } = await ctx.data.parties.upsert({
    name: lead.company || lead.name,
    phone: lead.phone,
    email: lead.email,
    gstin: lead.gstin,
    stateCode: state,
    externalRef: leadRef(lead.id),
  });
  await leads(ctx).update(lead.id, { partyId });
  await logActivity(ctx, lead.id, "system", created ? "Converted to a new customer" : "Linked to an existing customer");
  return { message: created ? "Customer created" : "Linked to the existing customer" };
}

/** A one-line quotation from the lead page (the full form is one click away). */
export async function quickQuotation(form: FormData, ctx: PluginContext): Promise<FormActionResult> {
  const lead = await visibleLead(ctx, text(form, "id", 64));
  if (!lead.partyId) throw new PluginError("Convert the lead to a customer first");
  const item = text(form, "item", 300);
  const qty = Number(text(form, "qty", 20) || 1);
  const rate = Number(text(form, "rate", 20));
  const gstRate = Number(text(form, "gstRate", 6) || 18);
  if (!item) throw new PluginError("Describe what you're quoting for");
  if (!(qty > 0) || !(rate >= 0) || !Number.isFinite(rate)) throw new PluginError("Enter a quantity and a rate");
  const q = await ctx.data.documents.createQuotation({ partyId: lead.partyId, items: [{ name: item, qty, rate, gstRate }], leadRef: leadRef(lead.id) });
  // The quotation.created event moves the stage and logs it; record the link right away too.
  const fresh = await leads(ctx).get(lead.id);
  const list = (fresh?.quotations ?? []).filter((x) => x.id !== q.id);
  await leads(ctx).update(lead.id, { quotations: [...list, { id: q.id, number: q.number, total: q.total }] });
  return { message: `Quotation ${q.number} created` };
}

export async function deleteLead(form: FormData, ctx: PluginContext): Promise<FormActionResult> {
  const lead = await visibleLead(ctx, text(form, "id", 64));
  await activities(ctx).deleteMany({ leadId: lead.id });
  await leads(ctx).delete(lead.id);
  return { redirect: ctx.pageUrl("leads"), message: `${lead.name} deleted` };
}
