"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const TABS = [
  ["company", "Company"],
  ["users", "Users"],
  ["numbering", "Numbering"],
  ["financial-years", "Financial years"],
  ["backup", "Backup"],
  ["/setup", "Setup wizard"],
] as const;

export function SettingsTabs({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
      {TABS.map(([slug, label]) => {
        // Entries starting with "/" live outside /settings (e.g. the setup wizard).
        const href = slug.startsWith("/") ? `/c/${companyId}${slug}` : `/c/${companyId}/settings/${slug}`;
        return (
          <Link
            key={slug}
            href={href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2",
              pathname.startsWith(href) ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
