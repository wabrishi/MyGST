import type { PluginContext, StoredRecord } from "@/lib/plugins/sdk";

/**
 * Lead Manager data model. Leads and their activities live in the plugin's own data tables
 * (manifest.collections), scoped to the company. Pure helpers here are unit-tested.
 */

export const WON = "Won";
export const LOST = "Lost";
export const PROPOSAL = "Proposal";

export interface Lead {
  name: string;
  company: string;
  phone: string;
  email: string;
  gstin: string;
  source: string;
  stage: string;
  /** Expected deal value, rupees. */
  value: number;
  ownerId: string;
  ownerName: string;
  /** Next open follow-up date (YYYY-MM-DD), kept in step with activities. */
  nextFollowUp: string;
  notes: string;
  /** Lower-cased name, company, phone and email: what the search box matches. */
  search: string;
  /** The MyGST customer once converted. */
  partyId: string;
  quotations: Array<{ id: string; number: string; total: number }>;
  closedAt: string;
  lostReason: string;
}

export type ActivityKind = "note" | "call" | "email" | "meeting" | "followup" | "system";
export const ACTIVITY_LABEL: Record<ActivityKind, string> = { note: "Note", call: "Call", email: "Email", meeting: "Meeting", followup: "Follow-up", system: "Update" };

export interface Activity {
  leadId: string;
  kind: ActivityKind;
  text: string;
  /** Follow-ups: due date (YYYY-MM-DD). */
  dueAt: string;
  /** Follow-ups: "yes" until done. */
  open: "yes" | "no";
  ownerId: string;
  byName: string;
}

export type LeadRecord = StoredRecord<Lead>;
export type ActivityRecord = StoredRecord<Activity>;

export const leadRef = (leadId: string) => `lead-manager:${leadId}`;
export const leadIdFromRef = (ref: unknown) => (typeof ref === "string" && ref.startsWith("lead-manager:") ? ref.slice("lead-manager:".length) : null);

/** Comma- or line-separated list from a setting, trimmed and de-duplicated. */
export function parseList(raw: unknown, fallback: string[]): string[] {
  const items = String(raw ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim().slice(0, 40))
    .filter(Boolean);
  const unique = [...new Set(items)];
  return unique.length ? unique : fallback;
}

export const DEFAULT_STAGES = ["New", "Contacted", "Qualified", PROPOSAL];
export const DEFAULT_SOURCES = ["Website", "Referral", "Walk-in", "Phone call", "Social media", "Other"];

/** Open pipeline stages from settings, then Won and Lost (always last). */
export function stagesFrom(settings: Record<string, unknown>) {
  const open = parseList(settings.stages, DEFAULT_STAGES).filter((s) => s !== WON && s !== LOST);
  return { open, all: [...open, WON, LOST] };
}

export const isClosed = (stage: string) => stage === WON || stage === LOST;

/** The stage before / after `stage` among open stages (Won/Lost are set explicitly). */
export function neighbourStage(open: string[], stage: string, dir: -1 | 1) {
  const i = open.indexOf(stage);
  if (i < 0) return null;
  return open[i + dir] ?? null;
}

/** Moving to Proposal on a quotation only moves forward, never back from a later stage. */
export function advanceTo(open: string[], current: string, target: string) {
  if (isClosed(current)) return current;
  const ci = open.indexOf(current);
  const ti = open.indexOf(target);
  if (ti < 0) return current;
  return ci < 0 || ti > ci ? target : current;
}

export const searchText = (l: Pick<Lead, "name" | "company" | "phone" | "email">) =>
  [l.name, l.company, l.phone, l.email]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .slice(0, 190);

/** Today in India (YYYY-MM-DD). */
export const todayIST = (now = Date.now()) => new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);

export const inr = (rupees: number) => `₹${Math.round(rupees).toLocaleString("en-IN")}`;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isoOrEmpty = (v: unknown) => (typeof v === "string" && ISO.test(v.trim()) ? v.trim() : "");

/** Can this user see this lead? Everyone with leads.viewAll; others only their own. */
export const canSee = (ctx: PluginContext, lead: Pick<Lead, "ownerId">) => ctx.can("leads.viewAll") || !ctx.user || lead.ownerId === ctx.user.id;

/** Filter for the leads a user may see. */
export const visibleWhere = (ctx: PluginContext) => (ctx.can("leads.viewAll") || !ctx.user ? {} : { ownerId: ctx.user.id });
