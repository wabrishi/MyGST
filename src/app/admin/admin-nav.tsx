"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/admin", label: "Companies", match: (p: string) => p === "/admin" || (p.startsWith("/admin/companies/") && p !== "/admin/companies/new") },
  { href: "/admin/companies/new", label: "New company", match: (p: string) => p === "/admin/companies/new" },
  { href: "/admin/backups", label: "Backups", match: (p: string) => p.startsWith("/admin/backups") },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 text-[13.5px]" aria-label="Admin">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.match(pathname) ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 font-medium transition-colors",
            l.match(pathname) ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-foreground",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
