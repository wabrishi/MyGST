import "server-only";
import { decryptSecret } from "../backup/crypto";
import { APPS_SECTION_KEY, pluginSectionKey } from "../nav";
import { canPlugin, canUseApp } from "../permissions";
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
  /** Plugins with several pages get their own sidebar section (named after the plugin). */
  section?: string;
  /** Stable keys for the menu order saved in Admin → Menu: "apps" or "plugin:<id>", and the item. */
  sectionKey: string;
  itemKey: string;
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
    const pages = e.manifest.pages.filter((p) => p.inNav && canOpenPage(ctx, e, p));
    const own = pages.length > 1;
    for (const p of pages) {
      items.push({
        href: `/c/${ctx.companyId}/apps/${e.plugin.id}/${p.slug}`,
        label: p.title,
        icon: p.icon ?? e.manifest.icon,
        ...(own && { section: e.manifest.name }),
        sectionKey: own ? pluginSectionKey(e.plugin.id) : APPS_SECTION_KEY,
        itemKey: own ? p.slug : `${e.plugin.id}/${p.slug}`,
      });
    }
  }
  const extra = await applyFilters({ companyId: ctx.companyId, user: ctx.user, role: ctx.role, member: ctx }, "nav.items", [] as LinkItem[], {});
  for (const l of extra.slice(0, 10)) {
    const href = companyHref(ctx.companyId, l.href);
    items.push({ href, label: String(l.label).slice(0, 40), icon: "Puzzle", sectionKey: APPS_SECTION_KEY, itemKey: `link:${l.href}`.slice(0, 120) });
  }
  return items;
}

/** A plugin page or widget: its roles (or app:<id>) and, if set, its capability. */
export function canOpenPage(ctx: CompanyContext, e: PluginEntry, p: { roles: readonly string[]; permission?: string }) {
  return canUseApp(ctx, e.plugin.id, p.roles) && (!p.permission || canPlugin(ctx, e.plugin.id, e.manifest.capabilities, p.permission));
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
      .filter((w) => canOpenPage(ctx, e, w))
      .filter((w) => (e.code ? e.code.widgets.has(w.id) : !!e.manifest.pageBaseUrl))
      .map((w) => ({ key: `${e.plugin.id}:${w.id}`, pluginId: e.plugin.id, title: w.title, width: w.width, entry: e, widgetId: w.id })),
  );
}

/** Renders a code plugin widget; a failing widget shows a small notice instead of breaking the dashboard. */
export async function renderCodeWidget(slot: WidgetSlot, ctx: CompanyContext) {
  const Component = slot.entry.code?.widgets.get(slot.widgetId);
  if (!Component) return null;
  try {
    return await Component({ ctx: await contextFor(slot.entry, ctx.companyId, ctx.user, ctx.role, ctx) });
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
