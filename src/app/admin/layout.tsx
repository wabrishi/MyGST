import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { Avatar, Badge } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/admin";
import { AdminNav } from "./admin-nav";

export const metadata = { title: { default: "Admin", template: "%s · MyGST Admin" } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireSuperAdmin();
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-5 px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Logo href="/admin" />
            <Badge color="amber">
              <ShieldCheck size={12} className="-ml-0.5" /> Super admin
            </Badge>
          </div>
          <AdminNav />
          <div className="ml-auto flex items-center gap-3 text-[13px]">
            <Link href="/companies" className="hidden text-muted hover:text-foreground sm:inline">
              My company
            </Link>
            <span className="hidden text-muted md:inline">{admin.email}</span>
            <Avatar name={admin.name} size={30} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
