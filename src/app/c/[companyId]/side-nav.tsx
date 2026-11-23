"use client";

import { ChevronDown, Puzzle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { APPS_SECTION_KEY, applyLayout, CORE_SECTIONS, DASHBOARD_ITEM, DEFAULT_LAYOUT, PLUGIN_ICONS, type NavLayout } from "@/lib/nav";

export type AppNavItem = { href: string; label: string; icon: string; section?: string; sectionKey: string; itemKey: string };

/** One link, already resolved to an absolute path. */
type Link_ = { key: string; href: string; label: string; icon: LucideIcon; external?: boolean; activeAlso?: string; badge?: number };
type Section = { key: string; title: string; items: Link_[] };

const COLLAPSED_KEY = "mygst.nav.collapsed";

/**
 * Collapsed sections, remembered per browser in localStorage (shared by every tab and by the desktop
 * sidebar and mobile drawer). Read through useSyncExternalStore: the server and first render see "all
 * open", so there's no hydration mismatch; if storage is blocked everything simply stays open.
 */
const NONE: string[] = [];
const listeners = new Set<() => void>();
let snapshot: { raw: string | null; keys: string[] } = { raw: null, keys: NONE };

function readRaw() {
  try {
    return localStorage.getItem(COLLAPSED_KEY);
  } catch {
    return null;
  }
}

function getCollapsed(): string[] {
  const raw = readRaw();
  if (raw !== snapshot.raw) {
    let keys = NONE;
    try {
      const v = JSON.parse(raw ?? "[]");
      if (Array.isArray(v)) keys = v.filter((x): x is string => typeof x === "string");
    } catch {
      /* ignore */
    }
    snapshot = { raw, keys };
  }
  return snapshot.keys;
}

function setCollapsed(keys: string[]) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(keys));
  } catch {
    /* storage blocked: sections just stay open */
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => e.key === COLLAPSED_KEY && onChange();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Core sections the member may see, then plugin sections; all in the order saved in Admin → Menu. */
function buildSections(companyId: string, perms: string[], apps: AppNavItem[], layout: NavLayout, badges: Record<string, number>): Section[] {
  const allowed = (perm?: string | readonly string[]) => !perm || (Array.isArray(perm) ? perm : [perm]).some((p) => perms.includes(p));
  const core: Section[] = CORE_SECTIONS.map((s) => ({
    key: s.key,
    title: s.title,
    items: s.items
      .filter((i) => allowed(i.perm as string | string[] | undefined))
      .map((i) => ({
        key: i.key,
        href: `/c/${companyId}/${i.href}`,
        label: i.label,
        icon: i.icon,
        badge: badges[i.key],
        ...(i.href === "settings" && { activeAlso: `/c/${companyId}/setup` }),
      })),
  }));
  const plugin = new Map<string, Section>();
  for (const a of apps) {
    const s = plugin.get(a.sectionKey) ?? { key: a.sectionKey, title: a.sectionKey === APPS_SECTION_KEY ? "Apps" : (a.section ?? "Apps"), items: [] };
    s.items.push({ key: a.itemKey, href: a.href, label: a.label, icon: PLUGIN_ICONS[a.icon] ?? Puzzle, external: /^https:\/\//i.test(a.href) });
    plugin.set(a.sectionKey, s);
  }
  return applyLayout([...core, ...plugin.values()], layout).filter((s) => s.items.length);
}

const isActive = (pathname: string, l: Pick<Link_, "href" | "external" | "activeAlso">) =>
  !l.external && (pathname === l.href || pathname.startsWith(l.href + "/") || (!!l.activeAlso && pathname.startsWith(l.activeAlso)));

function NavLink({ link, active, onNavigate }: { link: Link_; active: boolean; onNavigate?: () => void }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      {...(link.external && { target: "_blank", rel: "noreferrer" })}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
        active ? "bg-primary-soft text-primary" : "text-foreground/75 hover:bg-subtle hover:text-foreground",
      )}
    >
      <Icon size={17} className={cn("shrink-0 transition-colors", active ? "text-primary" : "text-muted group-hover:text-foreground")} />
      <span className="truncate">{link.label}</span>
      {!!link.badge && (
        <span className="ml-auto rounded-full bg-primary px-1.5 py-px text-[10.5px] font-semibold leading-4 text-primary-foreground" aria-label={`${link.badge} new`}>
          {link.badge > 99 ? "99+" : link.badge}
        </span>
      )}
    </Link>
  );
}

/** A titled group whose header expands / collapses it. */
function NavSection({ section, open, onToggle, children }: { section: Section; open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="group flex items-center justify-between rounded-md px-2.5 pb-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted/80 hover:text-foreground"
      >
        <span>{section.title}</span>
        <ChevronDown size={14} aria-hidden className={cn("transition-transform duration-150", !open && "-rotate-90")} />
      </button>
      <div id={id} hidden={!open} className="flex flex-col gap-0.5">
        {children}
      </div>
    </div>
  );
}

export function SideNav({
  companyId,
  perms,
  apps = [],
  layout = DEFAULT_LAYOUT,
  badges = {},
  onNavigate,
}: {
  companyId: string;
  perms: string[];
  apps?: AppNavItem[];
  layout?: NavLayout;
  /** Counts shown next to items (by item key), e.g. new received documents. */
  badges?: Record<string, number>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections = buildSections(companyId, perms, apps, layout, badges);
  const collapsed = useSyncExternalStore(subscribe, getCollapsed, () => NONE);
  // The section holding the current page shows open even if it was collapsed, until the user closes it
  // again on this page.
  const activeKey = sections.find((s) => s.items.some((l) => isActive(pathname, l)))?.key;
  const [closedHere, setClosedHere] = useState<string | null>(null);
  const isOpen = (key: string) => !collapsed.includes(key) || (key === activeKey && closedHere !== `${key}@${pathname}`);
  const toggle = (key: string) => {
    if (isOpen(key)) {
      setCollapsed([...new Set([...collapsed, key])]);
      if (key === activeKey) setClosedHere(`${key}@${pathname}`);
    } else {
      setCollapsed(collapsed.filter((k) => k !== key));
      setClosedHere(null);
    }
  };
  const dashboard: Link_ = { key: DASHBOARD_ITEM.key, href: `/c/${companyId}/${DASHBOARD_ITEM.href}`, label: DASHBOARD_ITEM.label, icon: DASHBOARD_ITEM.icon };

  return (
    <nav className="flex flex-col gap-4 px-3" aria-label="Main">
      <NavLink link={dashboard} active={isActive(pathname, dashboard)} onNavigate={onNavigate} />
      {sections.map((s) => {
        return (
          <NavSection key={s.key} section={s} open={isOpen(s.key)} onToggle={() => toggle(s.key)}>
            {s.items.map((l) => (
              <NavLink key={l.key} link={l} active={isActive(pathname, l)} onNavigate={onNavigate} />
            ))}
          </NavSection>
        );
      })}
    </nav>
  );
}
