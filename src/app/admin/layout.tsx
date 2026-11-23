import { ArrowLeftRight, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { Avatar, Badge } from "@/components/ui";
import { adminCan, requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { AdminMobileNav, AdminNav } from "./admin-nav";

export const metadata = { title: { default: "Admin", template: "%s · MyGSTBook Admin" } };

/** The admin console: a vertical sidebar (a drawer on phones), a slim top bar, and the page. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const roleLabel = admin.breakGlass ? "Super admin" : admin.roles.map((r) => r.name).join(", ");
  const perms = [...admin.permissions];
  const unread = adminCan(admin, "messages.view") ? await db.contactMessage.count({ where: { readAt: null } }).catch(() => 0) : 0;
  const badges = { "/admin/messages": unread };

  const brand = (
    <div className="flex flex-col gap-2">
      <Logo href="/admin" />
      <span>
        <Badge color="amber">
          <ShieldCheck size={12} className="-ml-0.5" /> {roleLabel}
        </Badge>
      </span>
    </div>
  );
  const footer = (
    <div className="flex flex-col gap-1 border-t border-border pt-4 text-[13px]">
      <Link href="/companies" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted hover:bg-subtle hover:text-foreground">
        <ArrowLeftRight size={15} /> My company
      </Link>
      <Link href="/account" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted hover:bg-subtle hover:text-foreground">
        <UserRound size={15} /> My profile
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-1">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:flex">
        <div className="px-5 pb-5 pt-5">{brand}</div>
        <div className="px-3">
          <AdminNav perms={perms} badges={badges} />
        </div>
        <div className="mt-auto px-3 pb-5 pt-6">{footer}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur-md md:px-8">
          <AdminMobileNav perms={perms} badges={badges} header={brand} footer={footer} />
          <div className="lg:hidden">
            <Logo href="/admin" size={24} />
          </div>
          <span className="hidden text-sm font-semibold lg:inline">Admin console</span>
          <div className="ml-auto flex items-center gap-3 text-[13px]">
            <span className="hidden text-muted md:inline">{admin.user.email}</span>
            <Link href="/account" aria-label="My profile">
              <Avatar name={admin.user.name} size={30} />
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
