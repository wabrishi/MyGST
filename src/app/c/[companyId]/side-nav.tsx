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
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";
import type { Role } from "@/generated/prisma/enums";
import { can, type Permission } from "@/lib/permissions";

const NAV: Array<{ href: string; label: string; icon: typeof FileText; perm?: Permission; section?: string }> = [
  { href: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "invoices", label: "Invoices", icon: FileText, section: "Sales" },
  { href: "quotations", label: "Quotations", icon: ScrollText },
  { href: "credit-notes", label: "Credit notes", icon: FileMinus },
  { href: "debit-notes", label: "Debit notes", icon: FilePlus },
  { href: "payments", label: "Payments", icon: ReceiptIndianRupee, perm: "payments.write" },
  { href: "purchases", label: "Purchases", icon: ShoppingCart, perm: "purchases.view", section: "Purchases" },
  { href: "parties", label: "Parties", icon: Users, section: "Masters" },
  { href: "products", label: "Products", icon: Package },
  { href: "reports", label: "Reports", icon: BarChart3, perm: "reports.view", section: "Reports" },
  { href: "settings", label: "Settings", icon: Settings, perm: "company.settings" },
];

export function SideNav({ companyId, role, horizontal }: { companyId: string; role: Role; horizontal?: boolean }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => !i.perm || can(role, i.perm));

  if (horizontal) {
    return (
      <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1">
        {items.map((i) => {
          const href = `/c/${companyId}/${i.href}`;
          return (
            <Link
              key={i.href}
              href={href}
              className={cn("whitespace-nowrap rounded px-2 py-1 text-xs", pathname.startsWith(href) ? "bg-primary/10 text-primary" : "text-muted")}
            >
              {i.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 overflow-y-auto px-2">
      {items.map((i) => {
        const href = `/c/${companyId}/${i.href}`;
        const active = pathname.startsWith(href);
        const Icon = i.icon;
        return (
          <div key={i.href}>
            {i.section && <div className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{i.section}</div>}
            <Link
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5",
                active ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-black/5",
              )}
            >
              <Icon size={16} />
              {i.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
