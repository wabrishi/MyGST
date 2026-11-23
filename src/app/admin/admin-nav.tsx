"use client";

import {
  Blocks,
  Building2,
  Cloud,
  Globe,
  KeyRound,
  LayoutDashboard,
  ListTree,
  Mail,
  Menu,
  MessageSquare,
  ScrollText,
  Server,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ui";
import { ADMIN_PAGES } from "@/lib/admin-permissions";

/** Sidebar groups for the admin pages (any page not listed here lands in "Platform"). */
const GROUPS: Array<{ title?: string; hrefs: string[] }> = [
  { hrefs: ["/admin"] },
  {
    title: "Customers",
    hrefs: ["/admin/companies", "/admin/users", "/admin/roles"],
  },
  {
    title: "Website",
    hrefs: [
      "/admin/messages",
      "/admin/website",
      "/admin/emails",
      "/admin/menu",
    ],
  },
  {
    title: "Platform",
    hrefs: [
      "/admin/plugins",
      "/admin/system",
      "/admin/backups",
      "/admin/audit",
    ],
  },
];

const ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/companies": Building2,
  "/admin/users": Users,
  "/admin/roles": KeyRound,
  "/admin/messages": MessageSquare,
  "/admin/website": Globe,
  "/admin/emails": Mail,
  "/admin/menu": ListTree,
  "/admin/plugins": Blocks,
  "/admin/system": Server,
  "/admin/backups": Cloud,
  "/admin/audit": ScrollText,
};

/** Vertical admin navigation: grouped links, only the pages this admin may open. */
export function AdminNav({
  perms,
  badges = {},
  onNavigate,
}: {
  perms: string[];
  badges?: Record<string, number>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const allowed = ADMIN_PAGES.filter((p) => perms.includes(p.perm));
  const listed = new Set(GROUPS.flatMap((g) => g.hrefs));
  const groups = GROUPS.map((g) => ({
    ...g,
    pages: g.hrefs
      .map((h) => allowed.find((p) => p.href === h))
      .filter((p) => !!p),
  }));
  const extra = allowed.filter((p) => !listed.has(p.href));
  if (extra.length) groups[groups.length - 1].pages.push(...extra);

  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {groups
        .filter((g) => g.pages.length)
        .map((g, gi) => (
          <div key={g.title ?? gi} className="flex flex-col gap-0.5">
            {g.title && (
              <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted/80">
                {g.title}
              </div>
            )}
            {g.pages.map((l) => {
              const active = l.exact
                ? pathname === l.href
                : pathname === l.href || pathname.startsWith(l.href + "/");
              const Icon = ICONS[l.href] ?? LayoutDashboard;
              const badge = badges[l.href];
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                    active
                      ? "bg-primary-soft text-primary"
                      : "text-foreground/75 hover:bg-subtle hover:text-foreground",
                  )}
                >
                  <Icon
                    size={17}
                    className={cn(
                      "shrink-0",
                      active
                        ? "text-primary"
                        : "text-muted group-hover:text-foreground",
                    )}
                  />
                  <span className="truncate">{l.label}</span>
                  {!!badge && (
                    <span
                      className="ml-auto rounded-full bg-primary px-1.5 py-px text-[10.5px] font-semibold leading-4 text-primary-foreground"
                      aria-label={`${badge} unread`}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
    </nav>
  );
}

/** Phones and tablets: the same navigation in a slide-in drawer. */
export function AdminMobileNav({
  perms,
  badges,
  header,
  footer,
}: {
  perms: string[];
  badges?: Record<string, number>;
  header: ReactNode;
  footer: ReactNode;
}) {
  const [open, setOpen] = useState(false);
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
        className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-subtle lg:hidden"
        aria-label="Open admin menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={20} />
      </button>
      {/* Portalled to <body>: the top bar's backdrop blur would otherwise trap this fixed overlay inside it. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-surface shadow-lg">
              <div className="flex items-center justify-between px-5 py-4">
                {header}
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-subtle"
                  aria-label="Close admin menu"
                  onClick={() => setOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="px-3">
                <AdminNav
                  perms={perms}
                  badges={badges}
                  onNavigate={() => setOpen(false)}
                />
              </div>
              <div className="mt-auto px-5 pb-5 pt-6">{footer}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
