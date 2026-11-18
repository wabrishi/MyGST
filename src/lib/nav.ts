import {
  BarChart3,
  Bell,
  Blocks,
  Boxes,
  Calculator,
  Calendar,
  ClipboardList,
  Cloud,
  FileMinus,
  FilePlus,
  FileText,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Package,
  Puzzle,
  QrCode,
  ReceiptIndianRupee,
  ScrollText,
  Send,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { SETTINGS_PERMISSIONS, type Permission } from "./permissions";

/**
 * The company sidebar menu: core sections, plugin section keys, and the order a super admin saves in
 * Admin → Menu (applied to every company). Pure: used by the sidebar, the admin editor and tests.
 */

/** `perm`: shown when the member holds it (or any of them, for a list). */
export type NavItemDef = { key: string; href: string; label: string; icon: LucideIcon; perm?: Permission | Permission[] };
export type NavSectionDef = { key: string; title: string; items: NavItemDef[] };

/** Always first, never moved. */
export const DASHBOARD_ITEM: NavItemDef = { key: "dashboard", href: "dashboard", label: "Dashboard", icon: LayoutDashboard };

const item = (href: string, label: string, icon: LucideIcon, perm?: Permission | Permission[]): NavItemDef => ({ key: href, href, label, icon, ...(perm && { perm }) });

export const CORE_SECTIONS: NavSectionDef[] = [
  {
    key: "sales",
    title: "Sales",
    items: [
      item("invoices", "Invoices", FileText),
      item("quotations", "Quotations", ScrollText),
      item("credit-notes", "Credit notes", FileMinus),
      item("debit-notes", "Debit notes", FilePlus),
      item("payments", "Payments", ReceiptIndianRupee, "payments.view"),
    ],
  },
  {
    key: "purchases",
    title: "Purchases",
    items: [item("purchase-orders", "Purchase orders", ClipboardList, "purchaseOrders.view"), item("purchases", "Purchase invoices", ShoppingCart, "purchases.view")],
  },
  { key: "masters", title: "Masters", items: [item("parties", "Parties", Users), item("products", "Products", Package)] },
  { key: "insights", title: "Insights", items: [item("reports", "Reports", BarChart3, "reports.view"), item("settings", "Settings", Settings, SETTINGS_PERMISSIONS)] },
];

/** Single-page plugins and plugin-added links. */
export const APPS_SECTION_KEY = "apps";
/** Each plugin with several pages gets its own section. */
export const pluginSectionKey = (pluginId: string) => `plugin:${pluginId}`;

/** Icons plugins may name in their manifest (anything else shows the puzzle piece). */
export const PLUGIN_ICONS: Record<string, LucideIcon> = {
  Puzzle, Bell, Blocks, Boxes, Calculator, Calendar, ClipboardList, Cloud, Mail, MessageSquare, QrCode, Send, Truck, Wallet,
  BarChart3, FileText, Package, ReceiptIndianRupee, ScrollText, ShoppingCart, Users, Settings, LayoutDashboard,
};

// ───────────────────────── Saved order ─────────────────────────

/** Section keys in order, and item keys in order per section. Missing keys keep their default place. */
export interface NavLayout {
  sections: string[];
  items: Record<string, string[]>;
}

export const DEFAULT_LAYOUT: NavLayout = { sections: [], items: {} };

const KEY = /^[\w:./-]{1,120}$/;
const keyList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((k): k is string => typeof k === "string" && KEY.test(k)))].slice(0, 200) : []);

/** Reads a stored layout; anything malformed falls back to the default order. */
export function parseLayout(raw: unknown): NavLayout {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_LAYOUT;
  const r = raw as { sections?: unknown; items?: unknown };
  const items: Record<string, string[]> = {};
  if (r.items && typeof r.items === "object" && !Array.isArray(r.items)) {
    for (const [k, v] of Object.entries(r.items).slice(0, 100)) if (KEY.test(k)) items[k] = keyList(v);
  }
  return { sections: keyList(r.sections), items };
}

/** Saved keys first (those that still exist), then the rest in their default order. */
export function orderByKeys<T extends { key: string }>(list: T[], saved: readonly string[] | undefined): T[] {
  if (!saved?.length) return list;
  const rank = new Map(saved.map((k, i) => [k, i]));
  const known = list.filter((x) => rank.has(x.key)).sort((a, b) => rank.get(a.key)! - rank.get(b.key)!);
  return [...known, ...list.filter((x) => !rank.has(x.key))];
}

/** Puts sections, and the items in each, in the saved order. */
export function applyLayout<S extends { key: string; items: Array<{ key: string }> }>(sections: S[], layout: NavLayout): S[] {
  return orderByKeys(sections, layout.sections).map((s) => ({ ...s, items: orderByKeys(s.items, layout.items[s.key]) }));
}

/** The layout that reproduces exactly this order (what the editor saves). */
export function layoutOf(sections: Array<{ key: string; items: Array<{ key: string }> }>): NavLayout {
  return { sections: sections.map((s) => s.key), items: Object.fromEntries(sections.map((s) => [s.key, s.items.map((i) => i.key)])) };
}
