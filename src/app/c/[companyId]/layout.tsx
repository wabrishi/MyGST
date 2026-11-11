import Link from "next/link";
import { db } from "@/lib/db";
import { availableFys, getSelectedFy } from "@/lib/fy-context";
import { financialYear, todayIST } from "@/lib/gst/fy";
import { ROLE_LABEL } from "@/lib/permissions";
import { requireCompany } from "@/lib/tenant";
import { FySwitcher } from "./fy-switcher";
import { SideNav } from "./side-nav";
import { SignOutButton } from "./sign-out-button";

export default async function CompanyLayout({ children, params }: LayoutProps<"/c/[companyId]">) {
  const { companyId } = await params;
  const ctx = await requireCompany(companyId);
  const [fys, selectedFy, company] = await Promise.all([
    availableFys(ctx.companyId),
    getSelectedFy(ctx.companyId),
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { lockedUntil: true } }),
  ]);
  const lockedUntil = company.lockedUntil?.toISOString().slice(0, 10) ?? null;
  if (!fys.includes(selectedFy)) fys.unshift(selectedFy);
  const fySwitcher = <FySwitcher companyId={companyId} fys={fys} selected={selectedFy} lockedUntil={lockedUntil} />;
  const notCurrent = selectedFy !== financialYear(todayIST());

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <Link href={`/c/${companyId}/dashboard`} className="px-4 pb-2 pt-4 text-lg font-bold text-primary">
          MyGST
        </Link>
        <div className="flex flex-col gap-2 px-3 pb-3">
          {fySwitcher}
          <div className="truncate rounded-md border border-border bg-background px-2.5 py-1.5 font-medium" title={ctx.company.legalName}>
            {ctx.company.tradeName || ctx.company.legalName}
          </div>
        </div>
        <SideNav companyId={companyId} role={ctx.role} />
        <div className="mt-auto border-t border-border px-4 py-3">
          <div className="truncate font-medium">{ctx.user.name}</div>
          <div className="truncate text-xs text-muted">
            {ctx.user.email} · {ROLE_LABEL[ctx.role]}
          </div>
          <SignOutButton />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between border-b border-border bg-surface px-4 py-2 md:hidden">
          <span className="font-bold text-primary">MyGST</span>
          <span className="truncate text-xs text-muted">{ctx.company.tradeName || ctx.company.legalName}</span>
        </header>
        <div className="no-print md:hidden">
          <div className="border-b border-border bg-surface px-3 py-2">{fySwitcher}</div>
          <SideNav companyId={companyId} role={ctx.role} horizontal />
        </div>
        {notCurrent && (
          <div className="no-print border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-xs text-warning">
            You are viewing FY 20{selectedFy}. Lists and reports default to this year
            {lockedUntil && `20${selectedFy.slice(3)}-03-31` <= lockedUntil ? " — this year is closed (read-only)." : "."}
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
