import "server-only";
import { decryptSecret } from "../backup/crypto";
import { canUseApp } from "../permissions";
import type { CompanyContext } from "../tenant";
import { pluginLog } from "./log";
import { activeEntries, applyFilters, contextFor, type PluginEntry } from "./runner";
import type { LinkItem } from "./sdk";
import { signPageToken } from "./token";

/** What plugins add to the company UI: sidebar links, dashboard widgets, framed external pages. */
export interface PluginNavItem {
  href: string;
  label: string;
  icon: string;
}


/** Resolves a plugin-provided href: absolute https stays as is; anything else is a path inside the company. */
export function companyHref(companyId: string, href: string) {
  if (/^https:\/\//i.test(href)) return href;
  return `/c/${companyId}/${href.replace(/^\/+/, "")}`;
}

export async function pluginNav(ctx: CompanyContext): Promise<PluginNavItem[]> {
  const entries = await activeEntries(ctx.companyId);
  const items: PluginNavItem[] = [];
  for (const e of entries) {
    for (const p of e.manifest.pages) {
      if (p.inNav && canUseApp(ctx, e.plugin.id, p.roles)) items.push({ href: `/c/${ctx.companyId}/apps/${e.plugin.id}/${p.slug}`, label: p.title, icon: p.icon ?? e.manifest.icon });
    }
  }
  const extra = await applyFilters({ companyId: ctx.companyId, user: ctx.user, role: ctx.role }, "nav.items", [] as LinkItem[], {});
  for (const l of extra.slice(0, 10)) items.push({ href: companyHref(ctx.companyId, l.href), label: String(l.label).slice(0, 40), icon: "Puzzle" });
  return items;
}

export interface WidgetSlot {
  key: string;
  pluginId: string;
  title: string;
  width: "third" | "half" | "full";
  entry: PluginEntry;
  widgetId: string;
}

export async function pluginWidgets(ctx: CompanyContext): Promise<WidgetSlot[]> {
  const entries = await activeEntries(ctx.companyId);
  return entries.flatMap((e) =>
    e.manifest.widgets
      .filter((w) => canUseApp(ctx, e.plugin.id, w.roles))
      .filter((w) => (e.code ? e.code.widgets.has(w.id) : !!e.manifest.pageBaseUrl))
      .map((w) => ({ key: `${e.plugin.id}:${w.id}`, pluginId: e.plugin.id, title: w.title, width: w.width, entry: e, widgetId: w.id })),
  );
}

/** Renders a code plugin widget; a failing widget shows a small notice instead of breaking the dashboard. */
export async function renderCodeWidget(slot: WidgetSlot, ctx: CompanyContext) {
  const Component = slot.entry.code?.widgets.get(slot.widgetId);
  if (!Component) return null;
  try {
    return await Component({ ctx: await contextFor(slot.entry, ctx.companyId, ctx.user, ctx.role) });
  } catch (e) {
    await pluginLog(slot.pluginId, ctx.companyId, "error", `widget ${slot.widgetId}: ${(e as Error).message}`);
    return null;
  }
}

/** URL for an external plugin's framed page/widget, with a 5-minute signed token. */
export function externalFrameUrl(e: PluginEntry, ctx: CompanyContext, view: string, path: string[] = [], search = "") {
  if (!e.manifest.pageBaseUrl || !e.cp?.webhookSecretEnc) return null;
  const token = signPageToken(decryptSecret(e.cp.webhookSecretEnc), { plugin: e.plugin.id, companyId: ctx.companyId, userId: ctx.user.id, name: ctx.user.name, role: ctx.role ?? "MEMBER", view });
  const base = e.manifest.pageBaseUrl.replace(/\/+$/, "");
  const target = view.startsWith("widget:") ? `${base}/widgets/${view.slice(7)}` : `${base}/${[view, ...path].map(encodeURIComponent).join("/")}`;
  const qs = new URLSearchParams(search);
  qs.set("mygst_token", token);
  return `${target}?${qs}`;
}
