"use client";

import {
  BarChart3,
  Bell,
  Blocks,
  Boxes,
  Calculator,
  Calendar,
  ClipboardList,
  Cloud,
  Mail,
  MessageSquare,
  Puzzle,
  QrCode,
  Send,
  Truck,
  Wallet,
  FileMinus,
  FilePlus,
  FileText,
  LayoutDashboard,
  Package,
  ReceiptIndianRupee,
  ScrollText,
  Settings,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";
import { SETTINGS_PERMISSIONS, type Permission } from "@/lib/permissions";

/** `perm`: shown when the member holds it (or any of them, for a list). */
type Item = { href: string; label: string; icon: LucideIcon; perm?: Permission | Permission[] };

/** Icons plugins may name in their manifest (anything else shows the puzzle piece). */
const PLUGIN_ICONS: Record<string, LucideIcon> = {
  Puzzle, Bell, Blocks, Boxes, Calculator, Calendar, ClipboardList, Cloud, Mail, MessageSquare, QrCode, Send, Truck, Wallet,
  BarChart3, FileText, Package, ReceiptIndianRupee, ScrollText, ShoppingCart, Users, Settings, LayoutDashboard,
};

export type AppNavItem = { href: string; label: string; icon: string; section?: string };

const SECTIONS: Array<{ title?: string; items: Item[] }> = [
  { items: [{ href: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    title: "Sales",
    items: [
      { href: "invoices", label: "Invoices", icon: FileText },
      { href: "quotations", label: "Quotations", icon: ScrollText },
      { href: "credit-notes", label: "Credit notes", icon: FileMinus },
      { href: "debit-notes", label: "Debit notes", icon: FilePlus },
      { href: "payments", label: "Payments", icon: ReceiptIndianRupee, perm: "payments.view" },
    ],
  },
  {
    title: "Purchases",
    items: [
      { href: "purchase-orders", label: "Purchase orders", icon: ClipboardList, perm: "purchaseOrders.view" },
      { href: "purchases", label: "Purchase invoices", icon: ShoppingCart, perm: "purchases.view" },
    ],
  },
  {
    title: "Masters",
    items: [
      { href: "parties", label: "Parties", icon: Users },
      { href: "products", label: "Products", icon: Package },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: "reports", label: "Reports", icon: BarChart3, perm: "reports.view" },
      { href: "settings", label: "Settings", icon: Settings, perm: SETTINGS_PERMISSIONS },
    ],
  },
];

/** Plugin links grouped: each multi-page plugin under its own title, the rest under "Apps". */
function appGroups(apps: AppNavItem[]) {
  const groups = new Map<string, AppNavItem[]>();
  for (const a of apps) {
    const key = a.section ?? "Apps";
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups].map(([title, items]) => ({ title, items }));
}

export function SideNav({ companyId, perms, apps = [], onNavigate }: { companyId: string; perms: string[]; apps?: AppNavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5 px-3" aria-label="Main">
      {SECTIONS.map((section, si) => {
        const items = section.items.filter((i) => !i.perm || (Array.isArray(i.perm) ? i.perm : [i.perm]).some((p) => perms.includes(p)));
        if (!items.length) return null;
        return (
          <div key={si} className="flex flex-col gap-0.5">
            {section.title && <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted/80">{section.title}</div>}
            {items.map((i) => {
              const href = `/c/${companyId}/${i.href}`;
              const active = pathname === href || pathname.startsWith(href + "/") || (i.href === "settings" && pathname.startsWith(`/c/${companyId}/setup`));
              const Icon = i.icon;
              return (
                <Link
                  key={i.href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                    active ? "bg-primary-soft text-primary" : "text-foreground/75 hover:bg-subtle hover:text-foreground",
                  )}
                >
                  <Icon size={17} className={cn("transition-colors", active ? "text-primary" : "text-muted group-hover:text-foreground")} />
                  {i.label}
                </Link>
              );
            })}
          </div>
        );
      })}
      {appGroups(apps).map((g) => {
        const links = g.items.map((a) => {
          const external = /^https:\/\//i.test(a.href);
          const active = !external && (pathname === a.href || pathname.startsWith(a.href + "/"));
          const Icon = PLUGIN_ICONS[a.icon] ?? Puzzle;
          return (
            <Link
              key={a.href}
              href={a.href}
              onClick={onNavigate}
              {...(external && { target: "_blank", rel: "noreferrer" })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                active ? "bg-primary-soft text-primary" : "text-foreground/75 hover:bg-subtle hover:text-foreground",
              )}
            >
              <Icon size={17} className={cn("transition-colors", active ? "text-primary" : "text-muted group-hover:text-foreground")} />
              <span className="truncate">{a.label}</span>
            </Link>
          );
        });
        // A plugin with several pages gets a collapsible section of its own.
        return g.title === "Apps" ? (
          <div key="apps" className="flex flex-col gap-0.5">
            <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted/80">Apps</div>
            {links}
          </div>
        ) : (
          <details key={g.title} open className="group/sec flex flex-col gap-0.5">
            <summary className="flex cursor-pointer list-none items-center justify-between px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted/80 hover:text-foreground">
              <span>{g.title}</span>
              <span aria-hidden className="text-[10px] transition-transform group-open/sec:rotate-90">▸</span>
            </summary>
            <div className="flex flex-col gap-0.5">{links}</div>
          </details>
        );
      })}
    </nav>
  );
}
