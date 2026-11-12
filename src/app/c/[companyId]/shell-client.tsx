"use client";

import { ChevronRight, LayoutGrid, LogOut, Menu, Settings, ShieldCheck, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Avatar, Badge, cn } from "@/components/ui";
import type { Role } from "@/generated/prisma/enums";
import { authClient } from "@/lib/auth-client";
import { SideNav } from "./side-nav";

// ───────────────────────── Mobile drawer ─────────────────────────

export function MobileNav({ header, top, companyId, role }: { header: ReactNode; top: ReactNode; companyId: string; role: Role }) {
  const [open, setOpen] = useState(false); // links close the drawer via onNavigate
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-foreground lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>
      {/* Portal: the sticky header uses backdrop-filter, which would otherwise trap position:fixed inside it. */}
      {open &&
        createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-surface pb-6 shadow-modal">
            <div className="flex items-center justify-between px-4 py-4">
              {header}
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted hover:bg-subtle" aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            {top}
            <SideNav companyId={companyId} role={role} onNavigate={() => setOpen(false)} />
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}

// ───────────────────────── Breadcrumbs ─────────────────────────

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  invoices: "Invoices",
  quotations: "Quotations",
  "credit-notes": "Credit notes",
  "debit-notes": "Debit notes",
  payments: "Payments",
  purchases: "Purchases",
  parties: "Parties",
  products: "Products",
  reports: "Reports",
  settings: "Settings",
  setup: "Setup",
  new: "New",
  edit: "Edit",
  gstr1: "GSTR-1",
  gstr3b: "GSTR-3B",
  "sales-register": "Sales register",
  "purchase-register": "Purchase register",
  outstanding: "Outstanding",
  ledger: "Party ledger",
  company: "Company",
  users: "Users",
  numbering: "Numbering",
  "financial-years": "Financial years",
  backup: "Backup",
};

export function Breadcrumbs({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  const base = `/c/${companyId}`;
  const parts = pathname.startsWith(base) ? pathname.slice(base.length).split("/").filter(Boolean) : [];
  const crumbs = parts.map((p, i) => ({
    label: LABELS[p] ?? "Details",
    href: `${base}/${parts.slice(0, i + 1).join("/")}`,
  }));
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-[13px] sm:flex">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight size={14} className="shrink-0 text-muted/60" />}
          {i === crumbs.length - 1 ? (
            <span className="truncate font-medium text-foreground">{c.label}</span>
          ) : (
            <Link href={c.href} className="truncate text-muted hover:text-foreground">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

// ───────────────────────── User menu ─────────────────────────

export function UserMenu({
  name,
  email,
  roleLabel,
  companyId,
  isOwner,
  isSuperAdmin,
}: {
  name: string;
  email: string;
  roleLabel: string;
  companyId: string;
  isOwner: boolean;
  isSuperAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] text-foreground/85 hover:bg-subtle hover:text-foreground";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-subtle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar name={name} size={30} />
        <span className="hidden max-w-32 truncate text-[13px] font-medium md:inline">{name.split(" ")[0]}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-pop">
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar name={name} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{name}</div>
              <div className="truncate text-xs text-muted">{email}</div>
            </div>
          </div>
          <div className="px-2.5 pb-2">
            <Badge color="blue">{roleLabel}</Badge>
          </div>
          <div className="my-1 h-px bg-border" />
          {isOwner && (
            <>
              <Link role="menuitem" href={`/c/${companyId}/settings/company`} className={item} onClick={() => setOpen(false)}>
                <Settings size={15} className="text-muted" /> Company settings
              </Link>
              <Link role="menuitem" href={`/c/${companyId}/setup`} className={item} onClick={() => setOpen(false)}>
                <Sparkles size={15} className="text-muted" /> Setup wizard
              </Link>
            </>
          )}
          <Link role="menuitem" href="/companies" className={item} onClick={() => setOpen(false)}>
            <LayoutGrid size={15} className="text-muted" /> Company overview
          </Link>
          {isSuperAdmin && (
            <Link role="menuitem" href="/admin" className={item} onClick={() => setOpen(false)}>
              <ShieldCheck size={15} className="text-muted" /> Admin panel
            </Link>
          )}
          <div className="my-1 h-px bg-border" />
          <button
            role="menuitem"
            type="button"
            className={cn(item, "text-danger hover:text-danger")}
            onClick={async () => {
              await authClient.signOut();
              router.replace("/login");
              router.refresh();
            }}
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
