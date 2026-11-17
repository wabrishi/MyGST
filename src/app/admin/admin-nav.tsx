"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";
import { ADMIN_PAGES } from "@/lib/admin-permissions";

export function AdminNav({ perms }: { perms: string[] }) {
  const pathname = usePathname();
  const links = ADMIN_PAGES.filter((l) => perms.includes(l.perm));
  return (
    <nav className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto text-[13.5px]" aria-label="Admin">
      {links.map((l) => {
        const active = l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 font-medium transition-colors",
              active ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
