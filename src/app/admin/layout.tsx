import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin";

export const metadata = { title: { default: "Admin", template: "%s · MyGST Admin" } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireSuperAdmin();
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-border bg-foreground px-4 py-2.5 text-white">
        <Link href="/admin" className="font-bold">
          MyGST <span className="rounded bg-white/15 px-1.5 py-0.5 text-xs font-medium">Super admin</span>
        </Link>
        <nav className="flex gap-3 text-sm">
          <Link href="/admin" className="opacity-90 hover:opacity-100">
            Companies
          </Link>
          <Link href="/admin/companies/new" className="opacity-90 hover:opacity-100">
            New company
          </Link>
          <Link href="/admin/backups" className="opacity-90 hover:opacity-100">
            Backups
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs opacity-80">
          <span>{admin.email}</span>
          <Link href="/companies" className="underline">
            My companies
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
