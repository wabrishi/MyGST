import {
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  CircleDollarSign,
  FilePlus2,
  FileText,
  HandCoins,
  Landmark,
  PackagePlus,
  Receipt,
  ReceiptIndianRupee,
  ScrollText,
  ShoppingCart,
  Target,
  Timer,
  Undo2,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Alert, ButtonLink, Card, CardHeader, Empty, MiniStat, PageHeader, StatCard, Table, Td, Th, Trend } from "@/components/ui";
import { db } from "@/lib/db";
import { DOC_KINDS, kindOfType } from "@/lib/doc-kinds";
import { isoOf } from "@/lib/documents";
import { fyLabel, getSelectedFy, fyRange } from "@/lib/fy-context";
import { formatINR, toPaise } from "@/lib/gst/calc";
import { can } from "@/lib/permissions";
import { fmtPct, ratePct } from "@/lib/reports/kpi-math";
import { dashboardKpis } from "@/lib/reports/kpis";
import { setupStatus } from "@/lib/setup";
import { requireCompany } from "@/lib/tenant";
import { ChartCard } from "./chart-card";
import { CashFlowChart, NetGstChart, SalesPurchasesChart } from "./charts";

export const metadata = { title: "Dashboard" };

const inrR = (rupees: number | null) => (rupees == null ? "—" : formatINR(Math.round(rupees * 100)));


function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage({ params, searchParams }: PageProps<"/c/[companyId]/dashboard">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await requireCompany(companyId);
  const name = ctx.company.tradeName || ctx.company.legalName;
  const base = `/c/${ctx.companyId}`;
  const fy = await getSelectedFy(ctx.companyId);
  const [from, to] = fyRange(fy);
  const financials = can(ctx.role, "reports.view");
  const setup = can(ctx.role, "company.settings") ? await setupStatus(ctx.companyId) : null;

  const notices = (
    <div className="mb-6 flex flex-col gap-3 empty:hidden">
      {sp.denied === "1" && <Alert kind="warning">You don&apos;t have permission to open that page. Ask the company owner to change your role.</Alert>}
      {sp.setup === "done" && <Alert kind="success">Your company is set up. Create your first invoice!</Alert>}
      {sp.setup !== "done" && setup && !setup.finished && (
        <Card className="flex flex-wrap items-center gap-5 border-primary/25 bg-gradient-to-r from-primary-soft to-surface p-5">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
            <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90" aria-hidden>
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${(setup.percent / 100) * 97.4} 97.4`}
              />
            </svg>
            <span className="absolute text-[11px] font-semibold">{setup.percent}%</span>
          </div>
          <div className="min-w-60 flex-1">
            <div className="font-semibold">Finish setting up your company</div>
            <div className="mt-0.5 text-[13px] text-muted">
              {setup.completed} of {setup.total} steps done · next: {setup.steps.find((s) => !s.done)?.title ?? "finish"}
            </div>
          </div>
          <ButtonLink href={`${base}/setup`}>
            Continue setup <ArrowRight size={15} />
          </ButtonLink>
        </Card>
      )}
    </div>
  );

  const recent = await db.document.findMany({
    where: { companyId: ctx.companyId, ...(financials ? {} : { createdById: ctx.user.id }) },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, type: true, number: true, date: true, partyName: true, grandTotal: true, status: true },
  });

  const QUICK = [
    { href: `${base}/invoices/new`, label: "New invoice", icon: FilePlus2 },
    { href: `${base}/quotations/new`, label: "New quotation", icon: ScrollText },
    ...(can(ctx.role, "payments.write") ? [{ href: `${base}/payments/new`, label: "Record payment", icon: HandCoins }] : []),
    { href: `${base}/parties/new`, label: "Add customer", icon: UserPlus },
    { href: `${base}/products/new`, label: "Add product", icon: PackagePlus },
  ];

  const quickCard = (
    <Card>
      <CardHeader title="Quick actions" />
      <div className="grid grid-cols-2 gap-2 p-3">
        {QUICK.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-[13px] font-medium transition-colors hover:border-primary/40 hover:bg-primary-soft"
          >
            <Icon size={16} className="text-muted transition-colors group-hover:text-primary" />
            {label}
          </Link>
        ))}
      </div>
    </Card>
  );

  const recentCard = (
    <Card className="overflow-hidden">
      <CardHeader
        title="Recent documents"
        actions={
          <Link href={`${base}/invoices`} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
            View all <ArrowUpRight size={14} />
          </Link>
        }
      />
      {recent.length === 0 ? (
        <Empty
          icon={FileText}
          title="No documents yet"
          action={
            <ButtonLink href={`${base}/invoices/new`} size="sm">
              Create your first invoice
            </ButtonLink>
          }
        >
          Add a customer and a product, then create an invoice — it will show up here.
        </Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Document</Th>
              <Th>Party</Th>
              <Th className="text-right">Total</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link className="font-medium text-foreground hover:text-primary" href={`${base}/${kindOfType(r.type)}/${r.id}`}>
                    {r.number}
                  </Link>
                  <div className="text-xs text-muted">
                    {DOC_KINDS[kindOfType(r.type)].singular} · {isoOf(r.date)}
                  </div>
                </Td>
                <Td className="max-w-48 truncate">{r.partyName}</Td>
                <Td className="tabular text-right font-medium">{formatINR(toPaise(r.grandTotal.toNumber()))}</Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );

  const header = (
    <PageHeader
      eyebrow={`${greeting()}, ${ctx.user.name.split(" ")[0]}`}
      title={name}
      subtitle={
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange size={14} /> {fyLabel(fy)} · {from} to {to}
        </span>
      }
      actions={
        <>
          <ButtonLink variant="secondary" href={`${base}/quotations/new`}>
            + Quotation
          </ButtonLink>
          <ButtonLink href={`${base}/invoices/new`}>+ Invoice</ButtonLink>
        </>
      }
    />
  );

  if (!financials) {
    return (
      <>
        {header}
        {notices}
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          {recentCard}
          {quickCard}
        </div>
      </>
    );
  }

  const k = await dashboardKpis(ctx.companyId, from, to);
  const fyShort = fyLabel(fy);
  const maxAgeing = Math.max(1, ...k.ageing.totals);
  const maxCustomer = Math.max(1, ...k.topCustomers.map((c) => c.total));
  const maxProduct = Math.max(1, ...k.topProducts.map((p) => p.taxable));
  const maxRate = Math.max(1, ...k.salesByRate.map((r) => r.value));
  const maxState = Math.max(1, ...k.salesByState.map((r) => r.value));
  const rateTotal = k.salesByRate.reduce((a, r) => a + r.value, 0);
  const stateTotal = k.salesByState.reduce((a, r) => a + r.value, 0);
  const rateShare = (v: number) => `${fmtPct(ratePct(v, rateTotal))} of sales`;
  const stateShare = (v: number) => `${fmtPct(ratePct(v, stateTotal))} of sales`;

  return (
    <>
      {header}
      {notices}

      {/* Headline KPIs */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sales (taxable)"
          value={formatINR(k.sales.taxable)}
          hint={
            k.sales.thisMonth != null ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>This month {formatINR(k.sales.thisMonth)}</span>
                <Trend pct={k.sales.momPct} />
              </span>
            ) : (
              fyShort
            )
          }
          icon={CircleDollarSign}
          tone="blue"
        />
        <StatCard
          label="Net GST payable"
          value={formatINR(k.gst.net)}
          hint={`Output ${formatINR(k.gst.output)} · ITC ${formatINR(k.gst.itc)}`}
          icon={Landmark}
          tone="amber"
        />
        <StatCard
          label="Receivable"
          value={formatINR(k.receivables.total)}
          hint={
            k.receivables.overdueCount
              ? `${formatINR(k.receivables.overdue)} overdue · ${k.receivables.overdueCount} ${k.receivables.overdueCount === 1 ? "document" : "documents"}`
              : "Nothing overdue"
          }
          icon={ReceiptIndianRupee}
          tone={k.receivables.overdueCount ? "red" : "green"}
        />
        <StatCard
          label="Collections"
          value={formatINR(k.collections.received)}
          hint={k.collections.ratePct != null ? `${fmtPct(k.collections.ratePct)} of invoiced value collected` : "Payments received this year"}
          icon={HandCoins}
          tone="green"
        />
      </div>

      {/* Secondary KPIs (4 × 2) */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat
          label="Invoices issued"
          value={k.invoices.count}
          hint={`${k.customers.active} ${k.customers.active === 1 ? "customer" : "customers"} billed`}
          icon={FileText}
          href={`${base}/invoices`}
        />
        <MiniStat label="Avg. invoice value" value={formatINR(k.invoices.avg)} hint="Incl. GST" icon={Receipt} />
        <MiniStat
          label="Avg. receivable age"
          value={k.receivables.avgAgeDays == null ? "—" : `${k.receivables.avgAgeDays} ${k.receivables.avgAgeDays === 1 ? "day" : "days"}`}
          hint="Unpaid invoices, weighted by amount"
          icon={Timer}
          href={`${base}/reports/outstanding`}
        />
        <MiniStat
          label="Customer mix"
          value={k.customers.b2bPct != null ? `B2B ${fmtPct(k.customers.b2bPct)}` : "—"}
          hint={k.customers.b2bPct != null ? `B2C ${fmtPct(100 - k.customers.b2bPct)} of taxable sales` : "No invoices yet"}
          icon={Users}
          href={`${base}/parties?type=customers`}
        />
        <MiniStat label="Purchases" value={formatINR(k.purchases.taxable)} hint={`GST paid ${formatINR(k.purchases.tax)}`} icon={ShoppingCart} href={`${base}/purchases`} />
        <MiniStat
          label="Payable"
          value={formatINR(k.payables.total)}
          hint={`${k.payables.count} open ${k.payables.count === 1 ? "bill" : "bills"}`}
          icon={Wallet}
          href={`${base}/reports/outstanding?side=payable`}
        />
        <MiniStat
          label="Quote win rate"
          value={fmtPct(k.quotations.conversionPct)}
          hint={`${k.quotations.won} of ${k.quotations.total} quotations won`}
          icon={Target}
          href={`${base}/quotations`}
        />
        <MiniStat
          label="Returns"
          value={formatINR(k.returns.creditNotes)}
          hint={k.returns.pct != null ? `${fmtPct(k.returns.pct, 1)} of invoiced value` : "Credit notes this year"}
          icon={Undo2}
          href={`${base}/credit-notes`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <ChartCard
            title="Sales vs purchases"
            description={`Monthly taxable value, ${fyShort}`}
            legend={[
              { label: "Sales", color: "var(--series-1)", kind: "rect" },
              { label: "Purchases", color: "var(--series-2)", kind: "rect" },
            ]}
            actions={
              <Link href={`${base}/reports/sales-register`} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                Sales register <ArrowUpRight size={14} />
              </Link>
            }
            table={{ columns: ["Month", "Sales", "Purchases"], rows: k.monthly.map((m) => [m.month, inrR(m.sales), inrR(m.purchases)]) }}
          >
            <SalesPurchasesChart data={k.monthly} />
          </ChartCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Cash flow"
              description="Invoiced (incl. GST) vs payments collected"
              legend={[
                { label: "Invoiced", color: "var(--series-1)", kind: "line" },
                { label: "Collected", color: "var(--series-2)", kind: "line" },
              ]}
              table={{ columns: ["Month", "Invoiced", "Collected"], rows: k.monthly.map((m) => [m.month, inrR(m.invoiced), inrR(m.collected)]) }}
            >
              <CashFlowChart data={k.monthly} />
            </ChartCard>
            <ChartCard
              title="Net GST payable"
              description="Output tax minus eligible ITC, by month"
              actions={
                <Link href={`${base}/reports/gstr3b`} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                  GSTR-3B <ArrowUpRight size={14} />
                </Link>
              }
              table={{
                columns: ["Month", "Output tax", "ITC", "Net"],
                rows: k.monthly.map((m) => [m.month, inrR(m.outputTax), inrR(m.itc), inrR(m.netGst)]),
              }}
            >
              <NetGstChart data={k.monthly} />
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <RankCard
              title="Sales by GST rate"
              description={`Invoice taxable value, ${fyShort}`}
              empty="No invoices this year yet."
              rows={k.salesByRate.map((r) => ({
                key: String(r.rate),
                label: `${r.rate}% GST`,
                sub: rateShare(r.value),
                value: formatINR(r.value),
                share: r.value / maxRate,
              }))}
            />
            <RankCard
              title="Sales by state"
              description={`By place of supply, ${fyShort}`}
              empty="No invoices this year yet."
              rows={k.salesByState.map((r) => ({
                key: r.code,
                label: r.label,
                sub: stateShare(r.value),
                value: formatINR(r.value),
                share: r.value / maxState,
              }))}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <RankCard
              title="Top customers"
              description={`By invoice value, ${fyShort}`}
              empty="No invoices this year yet."
              rows={k.topCustomers.map((c) => ({
                key: c.partyId,
                label: c.name,
                sub: `${c.invoices} ${c.invoices === 1 ? "invoice" : "invoices"}`,
                value: formatINR(c.total),
                share: c.total / maxCustomer,
                href: `${base}/reports/ledger?party=${c.partyId}`,
              }))}
            />
            <RankCard
              title="Top products"
              description={`By taxable value, ${fyShort}`}
              empty="No items sold this year yet."
              rows={k.topProducts.map((p) => ({
                key: p.name,
                label: p.name,
                sub: `Qty ${Number(p.qty.toFixed(3))}`,
                value: formatINR(p.taxable),
                share: p.taxable / maxProduct,
              }))}
            />
          </div>

          {recentCard}
        </div>

        <div className="flex flex-col gap-6">
          {quickCard}
          <Card>
            <CardHeader
              title="Receivables ageing"
              description={`${formatINR(k.ageing.grand)} outstanding, by days past due`}
              actions={
                <Link href={`${base}/reports/outstanding`} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                  Details <ArrowUpRight size={14} />
                </Link>
              }
            />
            <ul className="flex flex-col gap-3 px-5 py-4">
              {k.ageing.labels.map((label, i) => (
                <li key={label}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="text-muted">{label}</span>
                    <span className="tabular font-medium">{formatINR(k.ageing.totals[i])}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-subtle" aria-hidden>
                    {/* One hue, deepening with age (ordinal data, sequential ramp). */}
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(k.ageing.totals[i] / maxAgeing) * 100}%`, opacity: 0.35 + i * 0.16 }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="GST at a glance" description={fyShort} />
            <dl className="tabular divide-y divide-border text-sm">
              {[
                ["Output tax", formatINR(k.gst.output)],
                ["Eligible ITC", formatINR(k.gst.itc)],
                ["Net payable", formatINR(k.gst.net)],
              ].map(([key, v]) => (
                <div key={key} className="flex items-center justify-between px-5 py-3">
                  <dt className="text-muted">{key}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-border px-5 py-3">
              <Link href={`${base}/reports/gstr3b`} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                Open GSTR-3B summary <ArrowUpRight size={14} />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Ranked list with a proportional bar (top customers / products). */
function RankCard({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  empty: string;
  rows: Array<{ key: string; label: string; sub: string; value: string; share: number; href?: string }>;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-3.5 px-5 py-4">
          {rows.map((r, i) => (
            <li key={r.key}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-4 shrink-0 text-xs text-muted">{i + 1}</span>
                  {r.href ? (
                    <Link href={r.href} className="truncate font-medium hover:text-primary">
                      {r.label}
                    </Link>
                  ) : (
                    <span className="truncate font-medium">{r.label}</span>
                  )}
                  <span className="hidden shrink-0 text-xs text-muted sm:inline">{r.sub}</span>
                </span>
                <span className="tabular shrink-0 font-medium">{r.value}</span>
              </div>
              <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, r.share * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
