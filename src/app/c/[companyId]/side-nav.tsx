"use client";

import {
  BarChart3,
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
import type { Role } from "@/generated/prisma/enums";
import { can, type Permission } from "@/lib/permissions";

type Item = { href: string; label: string; icon: LucideIcon; perm?: Permission };

const SECTIONS: Array<{ title?: string; items: Item[] }> = [
  { items: [{ href: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    title: "Sales",
    items: [
      { href: "invoices", label: "Invoices", icon: FileText },
      { href: "quotations", label: "Quotations", icon: ScrollText },
      { href: "credit-notes", label: "Credit notes", icon: FileMinus },
      { href: "debit-notes", label: "Debit notes", icon: FilePlus },
      { href: "payments", label: "Payments", icon: ReceiptIndianRupee, perm: "payments.write" },
    ],
  },
  { title: "Purchases", items: [{ href: "purchases", label: "Purchases", icon: ShoppingCart, perm: "purchases.view" }] },
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
      { href: "settings", label: "Settings", icon: Settings, perm: "company.settings" },
    ],
  },
];

export function SideNav({ companyId, role, onNavigate }: { companyId: string; role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5 px-3" aria-label="Main">
      {SECTIONS.map((section, si) => {
        const items = section.items.filter((i) => !i.perm || can(role, i.perm));
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
    </nav>
  );
}
