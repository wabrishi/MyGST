"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui";
import { SITE_NAV } from "@/lib/site";

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

/** Desktop links (active one highlighted) and the phone menu. */
export function SiteNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    // Close the phone menu after navigating.
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const actions = signedIn ? (
    <Link href="/companies" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary-hover">
      Open app
    </Link>
  ) : (
    <>
      <Link href="/login" className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-foreground/80 hover:bg-subtle hover:text-foreground">
        Sign in
      </Link>
      <Link href="/signup" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary-hover">
        Start free
      </Link>
    </>
  );

  return (
    <>
      <nav aria-label="Website" className="hidden items-center gap-1 md:flex">
        {SITE_NAV.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isActive(pathname, l.href) ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive(pathname, l.href) ? "text-primary" : "text-foreground/70 hover:bg-subtle hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="hidden items-center gap-2 md:flex">{actions}</div>

      <button
        type="button"
        className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground hover:bg-subtle md:hidden"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
      {open && (
        <div id="site-menu" className="absolute inset-x-0 top-16 border-b border-border bg-surface px-4 pb-5 pt-2 shadow-lg md:hidden">
          <nav aria-label="Website menu" className="flex flex-col">
            {SITE_NAV.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(pathname, l.href) ? "page" : undefined}
                className={cn("rounded-lg px-3 py-3 text-base font-medium", isActive(pathname, l.href) ? "bg-primary-soft text-primary" : "text-foreground hover:bg-subtle")}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-4 [&>a]:flex-1 [&>a]:justify-center">{actions}</div>
        </div>
      )}
    </>
  );
}
