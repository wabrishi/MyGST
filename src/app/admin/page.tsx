import { Building2, FileText, IndianRupee, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartCard } from "@/components/chart-card";
import { Alert, Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { ADMIN_PAGES } from "@/lib/admin-permissions";
import { adminCan, requireAdmin } from "@/lib/admin";
import { platformOverview } from "@/lib/admin-stats";
import { formatINR } from "@/lib/gst/calc";
import { ColumnTrend } from "./admin-charts";

export const metadata = { title: "Overview" };

const n = new Intl.NumberFormat("en-IN");
/** formatINR takes paise; these figures are rupees. */
const rupees = (v: number) => formatINR(Math.round(v * 100));

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();
  // Admins without the dashboard go to the first page they may open.
  if (!adminCan(admin, "admin.dashboard")) redirect(ADMIN_PAGES.find((p) => admin.permissions.has(p.perm))?.href ?? "/companies");

  const s = await platformOverview();
  const fy = `FY ${s.fyStart.slice(2, 4)}-${String(Number(s.fyStart.slice(2, 4)) + 1).padStart(2, "0")}`;
  const maxTop = Math.max(1, ...s.topCompanies.map((c) => c.value));
  const showSystem = adminCan(admin, "system.view");

  return (
    <>
      <PageHeader title="Overview" subtitle={`Platform activity across all companies · ${s.today}`} />

      {showSystem && (s.attention.deadEvents > 0 || s.attention.pluginErrors > 0) && (
        <div className="mb-5">
          <Alert kind="warning">
            <span className="inline-flex flex-wrap items-center gap-1">
              {s.attention.deadEvents > 0 && <span>{n.format(s.attention.deadEvents)} event deliveries failed.</span>}
              {s.attention.pluginErrors > 0 && <span>{n.format(s.attention.pluginErrors)} plugin errors in the last 24 hours.</span>}
              <Link href="/admin/system" className="font-semibold underline underline-offset-2">
                Open system health
              </Link>
            </span>
          </Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Companies"
          value={n.format(s.companies.total)}
          icon={Building2}
          hint={`${n.format(s.companies.active)} active · ${n.format(s.companies.setupPending)} setup pending · ${n.format(s.companies.suspended)} suspended`}
        />
        <StatCard
          label="Users"
          value={n.format(s.users.total)}
          icon={Users}
          tone="green"
          hint={`${n.format(s.users.newThisWeek)} new this week${s.users.disabled ? ` · ${n.format(s.users.disabled)} disabled` : ""}`}
        />
        <StatCard
          label="Invoices this month"
          value={n.format(s.invoices.month.count)}
          icon={FileText}
          tone="amber"
          hint={`${rupees(s.invoices.month.value)} invoiced (incl. GST)`}
        />
        <StatCard label={`Sales ${fy}`} value={rupees(s.invoices.fy.value)} icon={IndianRupee} hint={`${n.format(s.invoices.fy.count)} invoices · ${n.format(s.pluginsInstalled)} plugins installed`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Invoices issued"
          description="Per month, last 12 months (cancelled excluded)"
          table={{ columns: ["Month", "Invoices"], rows: s.invoicesPerMonth.map((p) => [p.label, n.format(p.value)]) }}
        >
          <ColumnTrend data={s.invoicesPerMonth} name="invoices" label="Invoices issued per month, last 12 months" />
        </ChartCard>
        <ChartCard
          title="Sales value"
          description="Invoiced amount incl. GST per month, last 12 months"
          table={{ columns: ["Month", "Sales"], rows: s.salesPerMonth.map((p) => [p.label, rupees(p.value)]) }}
        >
          <ColumnTrend data={s.salesPerMonth} name="sales" money label="Sales value per month, last 12 months" />
        </ChartCard>
        <ChartCard
          title="New sign-ups"
          description="Users per week, last 12 weeks"
          table={{ columns: ["Week of", "Sign-ups"], rows: s.signupsPerWeek.map((p) => [p.label, n.format(p.value)]) }}
        >
          <ColumnTrend data={s.signupsPerWeek} name="sign-ups" label="New user sign-ups per week, last 12 weeks" />
        </ChartCard>
        <Card>
          <CardHeader title="Top companies" description={`By sales, ${fy}`} />
          {s.topCompanies.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">No invoices this year yet.</p>
          ) : (
            <ol className="flex flex-col gap-3.5 px-5 py-4">
              {s.topCompanies.map((c, i) => (
                <li key={c.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="w-4 shrink-0 text-xs text-muted">{i + 1}</span>
                      {adminCan(admin, "companies.view") ? (
                        <Link href={`/admin/companies/${c.id}`} className="truncate font-medium hover:text-primary">
                          {c.name}
                        </Link>
                      ) : (
                        <span className="truncate font-medium">{c.name}</span>
                      )}
                      <span className="hidden shrink-0 text-xs text-muted sm:inline">
                        {n.format(c.invoices)} {c.invoices === 1 ? "invoice" : "invoices"}
                      </span>
                    </span>
                    <span className="tabular shrink-0 font-medium">{rupees(c.value)}</span>
                  </div>
                  <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
                    <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${Math.max(2, (c.value / maxTop) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
