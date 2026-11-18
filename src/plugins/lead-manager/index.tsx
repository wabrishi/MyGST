import { definePlugin, type PluginContext, type PluginEventEnvelope } from "@/lib/plugins/sdk";
import { activities, addActivity, completeFollowUp, convertLead, createLead, deleteLead, leads, logActivity, moveStage, quickQuotation, updateLead } from "./actions";
import { advanceTo, inr, isClosed, leadIdFromRef, PROPOSAL, stagesFrom, todayIST, WON, type LeadRecord } from "./model";
import { FollowUpsPage, LeadsPage, PipelinePage, TodayWidget } from "./pages";

/**
 * Lead Manager: a small CRM inside MyGST, and the reference "big" plugin. It shows every part of the
 * plugin platform: data tables (collections), its own role permissions (capabilities), a sidebar
 * section with several pages, form actions, a dashboard widget, events and a daily job that emails.
 * Guide: docs/plugins/README.md
 */

type EventData = { id?: string; number?: string; total?: number; partyId?: string; leadRef?: string };

/** The lead an event is about: by leadRef (quotations made from the lead) or by its customer. */
async function leadFor(ctx: PluginContext, data: EventData): Promise<LeadRecord | null> {
  const byRef = leadIdFromRef(data.leadRef);
  if (byRef) {
    const l = await leads(ctx).get(byRef);
    if (l) return l;
  }
  if (!data.partyId) return null;
  const open = await leads(ctx).find({ where: { partyId: data.partyId }, limit: 20 });
  return open.find((l) => !isClosed(l.stage)) ?? open[0] ?? null;
}

async function onQuotation(event: PluginEventEnvelope, ctx: PluginContext) {
  const data = event.data as EventData;
  const lead = await leadFor(ctx, data);
  if (!lead || !data.id) return;
  const { open } = stagesFrom(ctx.settings);
  const stage = advanceTo(open, lead.stage, PROPOSAL);
  const quotations = lead.quotations.some((q) => q.id === data.id) ? lead.quotations : [...lead.quotations, { id: data.id, number: data.number ?? "", total: Number(data.total ?? 0) }];
  await leads(ctx).update(lead.id, { stage, quotations });
  await logActivity(ctx, lead.id, "system", `Quotation ${data.number ?? ""} created (${inr(Number(data.total ?? 0))})${stage !== lead.stage ? `. Stage: ${lead.stage} → ${stage}` : ""}`);
}

async function onInvoice(event: PluginEventEnvelope, ctx: PluginContext) {
  const data = event.data as EventData;
  const lead = await leadFor(ctx, data);
  if (!lead || lead.stage === WON) return;
  await leads(ctx).update(lead.id, { stage: WON, closedAt: todayIST() });
  await logActivity(ctx, lead.id, "system", `Invoice ${data.number ?? ""} issued (${inr(Number(data.total ?? 0))}). Marked as won.`);
}

/** Daily: each owner gets one email with their overdue and today's follow-ups. */
async function dailyDigest(ctx: PluginContext) {
  if (!ctx.settings.digest) return;
  const today = todayIST();
  const due = await activities(ctx).find({ where: { kind: "followup", open: "yes", dueAt: { lte: today } }, orderBy: "dueAt", limit: 500 });
  const byOwner = new Map<string, typeof due>();
  for (const a of due) if (a.ownerId) byOwner.set(a.ownerId, [...(byOwner.get(a.ownerId) ?? []), a]);
  for (const [ownerId, items] of byOwner) {
    const names = new Map((await leads(ctx).find({ where: { id: { in: [...new Set(items.map((i) => i.leadId))] } }, limit: 500 })).map((l) => [l.id, l]));
    const rows = items
      .filter((i) => names.has(i.leadId) && !isClosed(names.get(i.leadId)!.stage))
      .map((i) => {
        const l = names.get(i.leadId)!;
        const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
        return `<li><a href="${ctx.appUrl(ctx.pageUrl("leads", l.id))}">${esc(l.name)}</a>${i.dueAt < today ? " <b>(overdue)</b>" : ""}: ${esc(i.text)}</li>`;
      });
    if (!rows.length) continue;
    await ctx.mail.send({
      toUserIds: [ownerId],
      subject: `${rows.length} follow-up${rows.length === 1 ? "" : "s"} due today`,
      html: `<p>Your follow-ups for ${today}:</p><ul>${rows.join("")}</ul><p><a href="${ctx.appUrl(ctx.pageUrl("follow-ups"))}">Open follow-ups</a></p>`,
    });
  }
}

export default definePlugin({
  manifest: {
    id: "lead-manager",
    name: "Lead Manager",
    version: "1.0.0",
    description: "Track enquiries through your sales pipeline: leads, follow-ups and notes, then convert a lead into a customer and a quotation. Leads are marked won when you invoice them.",
    author: "MyGST",
    icon: "Users",
    permissions: ["company:read", "parties:read", "parties:write", "documents:read", "documents:write", "mail:send"],
    events: ["quotation.created", "invoice.issued"],
    settings: [
      { key: "stages", label: "Pipeline stages", type: "textarea", default: "New, Contacted, Qualified, Proposal", help: "In order, separated by commas. Won and Lost are always added at the end." },
      { key: "sources", label: "Lead sources", type: "textarea", default: "Website, Referral, Walk-in, Phone call, Social media, Other" },
      { key: "digest", label: "Email each person their follow-ups every morning", type: "boolean", default: true },
    ],
    capabilities: [
      { key: "leads.view", label: "See leads and the pipeline", roles: ["OWNER", "ACCOUNTANT", "STAFF"] },
      { key: "leads.viewAll", label: "See everyone's leads (not only their own) and assign them", roles: ["OWNER", "ACCOUNTANT"] },
      { key: "leads.manage", label: "Create and edit leads, log activities", roles: ["OWNER", "ACCOUNTANT", "STAFF"] },
      { key: "leads.convert", label: "Convert leads to customers and create quotations", roles: ["OWNER", "ACCOUNTANT"] },
      { key: "leads.delete", label: "Delete leads", roles: ["OWNER"] },
    ],
    collections: [
      { name: "leads", indexes: ["stage", "ownerId", "partyId", "search"], numbers: ["value"] },
      { name: "activities", indexes: ["leadId", "kind", "dueAt", "open"], numbers: [] },
    ],
    pages: [
      { slug: "pipeline", title: "Pipeline", icon: "BarChart3", roles: ["OWNER", "ACCOUNTANT", "STAFF"], inNav: true, permission: "leads.view" },
      { slug: "leads", title: "Leads", icon: "Users", roles: ["OWNER", "ACCOUNTANT", "STAFF"], inNav: true, permission: "leads.view" },
      { slug: "follow-ups", title: "Follow-ups", icon: "Calendar", roles: ["OWNER", "ACCOUNTANT", "STAFF"], inNav: true, permission: "leads.view" },
    ],
    widgets: [{ id: "today", title: "Today's follow-ups", roles: ["OWNER", "ACCOUNTANT", "STAFF"], width: "third", permission: "leads.view" }],
    jobs: [{ id: "digest", every: "daily", title: "Morning follow-up email" }],
  },
  setup(api) {
    api.page("pipeline", PipelinePage);
    api.page("leads", LeadsPage);
    api.page("follow-ups", FollowUpsPage);
    api.widget("today", TodayWidget);

    api.action("createLead", createLead, { permission: "leads.manage" });
    api.action("updateLead", updateLead, { permission: "leads.manage" });
    api.action("moveStage", moveStage, { permission: "leads.manage" });
    api.action("addActivity", addActivity, { permission: "leads.manage" });
    api.action("completeFollowUp", completeFollowUp, { permission: "leads.manage" });
    api.action("convertLead", convertLead, { permission: "leads.convert" });
    api.action("quickQuotation", quickQuotation, { permission: "leads.convert" });
    api.action("deleteLead", deleteLead, { permission: "leads.delete" });

    api.on("quotation.created", onQuotation);
    api.on("invoice.issued", onInvoice);
    api.schedule("digest", dailyDigest);
  },
});
