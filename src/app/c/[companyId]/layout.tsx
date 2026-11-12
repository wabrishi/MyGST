import { AlertTriangle, Plus } from "lucide-react";
import { Logo } from "@/components/brand";
import { Avatar, ButtonLink } from "@/components/ui";
import { isSuperAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { availableFys, getSelectedFy } from "@/lib/fy-context";
import { financialYear, todayIST } from "@/lib/gst/fy";
import { entitlementBanner, hubBillingUrl, hubMode, hubUrl } from "@/lib/hub";
import { ROLE_LABEL, can } from "@/lib/permissions";
import { requireCompany } from "@/lib/tenant";
import { FySwitcher } from "./fy-switcher";
import { Breadcrumbs, MobileNav, UserMenu } from "./shell-client";
import { SideNav } from "./side-nav";

export default async function CompanyLayout({ children, params }: LayoutProps<"/c/[companyId]">) {
  const { companyId } = await params;
  const ctx = await requireCompany(companyId);
  const [fys, selectedFy, company] = await Promise.all([
    availableFys(ctx.companyId),
    getSelectedFy(ctx.companyId),
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { lockedUntil: true, entitlement: true, hubWorkspaceId: true } }),
  ]);
  const hub = hubMode();
  const plan = entitlementBanner(company.entitlement);
  const hubNotice = hub ? (await db.user.findUnique({ where: { id: ctx.user.id }, select: { hubNotice: true } }))?.hubNotice : null;
  const lockedUntil = company.lockedUntil?.toISOString().slice(0, 10) ?? null;
  if (!fys.includes(selectedFy)) fys.unshift(selectedFy);
  const notCurrent = selectedFy !== financialYear(todayIST());
  const companyName = ctx.company.tradeName || ctx.company.legalName;
  const home = `/c/${companyId}/dashboard`;

  const companyCard = (
    <div className="mx-3 mb-5 flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5" title={ctx.company.legalName}>
      <Avatar name={companyName} size={32} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold">{companyName}</div>
        <div className="truncate font-mono text-[11px] text-muted">{ctx.company.gstin || "Unregistered"}</div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-1">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:flex">
        <div className="px-5 pb-5 pt-5">
          <Logo href={home} />
        </div>
        {companyCard}
        <SideNav companyId={companyId} role={ctx.role} />
        <div className="mt-auto px-5 pb-5 pt-6 text-[11px] text-muted">GST-ready billing · FY 20{selectedFy}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur-md md:px-6">
          <MobileNav header={<Logo href={home} />} top={companyCard} companyId={companyId} role={ctx.role} />
          <div className="sm:hidden">
            <Logo href={home} size={24} />
          </div>
          <Breadcrumbs companyId={companyId} />
          <div className="ml-auto flex items-center gap-2">
            <FySwitcher companyId={companyId} fys={fys} selected={selectedFy} lockedUntil={lockedUntil} />
            {can(ctx.role, "docs.create") && (
              <ButtonLink href={`/c/${companyId}/invoices/new`} size="sm" className="hidden sm:inline-flex">
                <Plus size={15} /> New invoice
              </ButtonLink>
            )}
            <UserMenu
              name={ctx.user.name}
              email={ctx.user.email}
              roleLabel={ROLE_LABEL[ctx.role]}
              companyId={companyId}
              isOwner={can(ctx.role, "company.settings")}
              isSuperAdmin={isSuperAdmin(ctx.user)}
              hubLogoutUrl={hub ? `${hubUrl()}/logout` : null}
            />
          </div>
        </header>

        {plan && (
          <div
            role="status"
            className={`no-print flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[13px] md:px-6 ${plan.kind === "danger" ? "border-danger/25 bg-danger-soft text-danger" : "border-warning/25 bg-warning-soft text-warning"}`}
          >
            <AlertTriangle size={15} className="shrink-0" />
            <span>{plan.text}</span>
            {can(ctx.role, "company.settings") && (
              <a href={hubBillingUrl(company.hubWorkspaceId)} className="font-semibold underline underline-offset-2">
                Open billing
              </a>
            )}
          </div>
        )}
        {hubNotice && (
          <div role="status" className="no-print flex items-center gap-2 border-b border-warning/25 bg-warning-soft px-4 py-2 text-[13px] text-warning md:px-6">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{hubNotice}</span>
          </div>
        )}
        {notCurrent && (
          <div className="no-print flex items-center gap-2 border-b border-warning/25 bg-warning-soft px-4 py-2 text-[13px] text-warning md:px-6">
            <AlertTriangle size={15} className="shrink-0" />
            <span>
              You are viewing FY 20{selectedFy}. Lists and reports default to this year
              {lockedUntil && `20${selectedFy.slice(3)}-03-31` <= lockedUntil ? " — this year is closed (read-only)." : "."}
            </span>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
