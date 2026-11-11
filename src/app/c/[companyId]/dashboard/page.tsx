import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Alert, ButtonLink, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { kindOfType } from "@/lib/doc-kinds";
import { isoOf } from "@/lib/documents";
import { fyLabel, getSelectedFy, fyRange } from "@/lib/fy-context";
import { formatINR, toPaise } from "@/lib/gst/calc";
import { monthRange, todayIST } from "@/lib/gst/fy";
import { openPayables, openReceivables } from "@/lib/payments";
import { can } from "@/lib/permissions";
import { setupStatus } from "@/lib/setup";
import { requireCompany } from "@/lib/tenant";
import { SalesChart } from "./sales-chart";

export const metadata = { title: "Dashboard" };

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const d = (iso: string) => new Date(iso + "T00:00:00Z");

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export default async function DashboardPage({ params, searchParams }: PageProps<"/c/[companyId]/dashboard">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const denied = sp.denied === "1";
  const deniedAlert = denied && (
    <div className="mb-4">
      <Alert kind="warning">You don&apos;t have permission to open that page. Ask the company owner to change your role.</Alert>
    </div>
  );
  const ctx = await requireCompany(companyId);
  const name = ctx.company.tradeName || ctx.company.legalName;
  const base = `/c/${ctx.companyId}`;
  const fy = await getSelectedFy(ctx.companyId);
  const [from, to] = fyRange(fy);
  const financials = can(ctx.role, "reports.view");
  const setup = can(ctx.role, "company.settings") ? await setupStatus(ctx.companyId) : null;
  const setupBanner = sp.setup === "done" ? (
    <div className="mb-4">
      <Alert kind="success">Your company is set up. Create your first invoice!</Alert>
    </div>
  ) : setup && !setup.finished ? (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-primary/30 bg-primary/5 p-4">
      <div className="min-w-60 flex-1">
        <div className="font-semibold">Finish setting up your company</div>
        <div className="text-xs text-muted">
          {setup.completed} of {setup.total} steps done · next: {setup.steps.find((s) => !s.done)?.title ?? "finish"}
        </div>
        <div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-border" aria-hidden>
          <div className="h-full bg-primary" style={{ width: `${setup.percent}%` }} />
        </div>
      </div>
      <ButtonLink href={`${base}/setup`}>Continue setup</ButtonLink>
    </Card>
  ) : null;

  const recent = await db.document.findMany({
    where: { companyId: ctx.companyId, ...(financials ? {} : { createdById: ctx.user.id }) },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, type: true, number: true, date: true, partyName: true, grandTotal: true, status: true },
  });

  const quickActions = (
    <>
      <ButtonLink variant="secondary" href={`${base}/quotations/new`}>
        + Quotation
      </ButtonLink>
      <ButtonLink href={`${base}/invoices/new`}>+ Invoice</ButtonLink>
    </>
  );

  const recentCard = (
    <Card>
      <h2 className="p-3 font-semibold">Recent documents</h2>
      {recent.length === 0 ? (
        <Empty>
          No documents yet. Start by adding a <Link className="text-primary underline" href={`${base}/parties/new`}>customer</Link> and a{" "}
          <Link className="text-primary underline" href={`${base}/products/new`}>product</Link>.
        </Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Date</Th>
              <Th>Party</Th>
              <Th className="text-right">Total</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link className="text-primary hover:underline" href={`${base}/${kindOfType(r.type)}/${r.id}`}>
                    {r.number}
                  </Link>
                </Td>
                <Td>{isoOf(r.date)}</Td>
                <Td>{r.partyName}</Td>
                <Td className="tabular text-right">{formatINR(toPaise(r.grandTotal.toNumber()))}</Td>
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

  if (!financials) {
    return (
      <>
        <PageHeader title={name} subtitle={fyLabel(fy)} actions={quickActions} />
        {deniedAlert}
        {setupBanner}
        {recentCard}
      </>
    );
  }

  const [mFrom, mTo] = monthRange(todayIST());
  const [docs, bills, receivables, payables] = await Promise.all([
    db.document.findMany({
      where: { companyId: ctx.companyId, status: "ISSUED", type: { in: ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] }, date: { gte: d(from), lte: d(to) } },
      select: { type: true, date: true, taxableTotal: true, cgst: true, sgst: true, igst: true },
    }),
    db.purchaseBill.findMany({
      where: { companyId: ctx.companyId, cancelled: false, itcType: { not: "INELIGIBLE" }, billDate: { gte: d(from), lte: d(to) } },
      select: { cgst: true, sgst: true, igst: true, partyGstin: true, reverseCharge: true },
    }),
    openReceivables(db, ctx.companyId),
    openPayables(db, ctx.companyId),
  ]);

  const monthly = MONTHS.map((month) => ({ month, sales: 0 }));
  let fySales = 0, monthSales = 0, outputTax = 0;
  for (const doc of docs) {
    const sign = doc.type === "CREDIT_NOTE" ? -1 : 1;
    const taxable = sign * toPaise(doc.taxableTotal.toNumber());
    const iso = isoOf(doc.date);
    fySales += taxable;
    outputTax += sign * toPaise(doc.cgst.toNumber() + doc.sgst.toNumber() + doc.igst.toNumber());
    if (iso >= mFrom && iso <= mTo) monthSales += taxable;
    monthly[(Number(iso.slice(5, 7)) + 8) % 12].sales += taxable / 100;
  }
  const itc = bills
    .filter((b) => b.partyGstin || b.reverseCharge)
    .reduce((s, b) => s + toPaise(b.cgst.toNumber() + b.sgst.toNumber() + b.igst.toNumber()), 0);
  const today = todayIST();
  const receivable = receivables.reduce((s, r) => s + r.balance, 0);
  const overdue = receivables.filter((r) => (r.dueDate || r.date) < today && r.dueDate);
  const payable = payables.reduce((s, r) => s + r.balance, 0);

  return (
    <>
      <PageHeader title={name} subtitle={`${fyLabel(fy)} · ${from} to ${to}`} actions={quickActions} />
      {deniedAlert}
      {setupBanner}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Sales (${fyLabel(fy)}, taxable)`} value={formatINR(fySales)} hint={`This month ${formatINR(monthSales)}`} />
        <Stat label="Output GST" value={formatINR(outputTax)} hint={`Eligible ITC ${formatINR(itc)} · Net ${formatINR(outputTax - itc)}`} />
        <Stat label="Receivable (all years)" value={formatINR(receivable)} hint={`${overdue.length} overdue ${overdue.length === 1 ? "document" : "documents"}`} />
        <Stat label="Payable (all years)" value={formatINR(payable)} hint={`${payables.length} open ${payables.length === 1 ? "bill" : "bills"}`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Card className="p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold">Monthly sales</h2>
            <Link href={`${base}/reports/sales-register`} className="text-xs text-primary hover:underline">
              Sales register →
            </Link>
          </div>
          <SalesChart data={monthly} />
        </Card>
        {recentCard}
      </div>
    </>
  );
}
