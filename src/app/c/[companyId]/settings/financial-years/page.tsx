import { Badge, Card, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { availableFys, fyRange } from "@/lib/fy-context";
import { formatINR, toPaise } from "@/lib/gst/calc";
import { financialYear, todayIST } from "@/lib/gst/fy";
import { requireCompanyPage } from "@/lib/tenant";
import { FyLockButton } from "./fy-lock-button";

export const metadata = { title: "Financial years" };

export default async function FinancialYearsPage({ params }: PageProps<"/c/[companyId]/settings/financial-years">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "company.settings");
  const [fys, company] = await Promise.all([
    availableFys(ctx.companyId),
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { lockedUntil: true } }),
  ]);
  const lockedUntil = company.lockedUntil?.toISOString().slice(0, 10) ?? null;
  const current = financialYear(todayIST());

  const rows = await Promise.all(
    fys.map(async (fy) => {
      const [from, to] = fyRange(fy).map((d) => new Date(d + "T00:00:00Z"));
      const [sales, purchases, invoiceCount] = await Promise.all([
        db.document.aggregate({
          where: { companyId: ctx.companyId, type: "INVOICE", status: "ISSUED", date: { gte: from, lte: to } },
          _sum: { grandTotal: true },
        }),
        db.purchaseBill.aggregate({ where: { companyId: ctx.companyId, cancelled: false, billDate: { gte: from, lte: to } }, _sum: { grandTotal: true } }),
        db.document.count({ where: { companyId: ctx.companyId, type: "INVOICE", date: { gte: from, lte: to } } }),
      ]);
      return {
        fy,
        invoiceCount,
        sales: toPaise(sales._sum.grandTotal?.toNumber() ?? 0),
        purchases: toPaise(purchases._sum.grandTotal?.toNumber() ?? 0),
        closed: !!lockedUntil && fyRange(fy)[1] <= lockedUntil,
      };
    }),
  );

  return (
    <Card>
      <div className="p-4">
        <h2 className="font-semibold">Financial years</h2>
        <p className="mt-1 text-xs text-muted">
          Each financial year (1 April – 31 March) has its own document numbering. Use the year selector in the sidebar to switch the year shown in
          lists, reports and the dashboard. <b>Closing</b> a year locks it: invoices, notes, purchases and payments dated in it can no longer be
          created, edited or cancelled. Close a year after filing its annual return. Closing a year also closes all earlier years.
        </p>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Year</Th>
            <Th className="text-right">Invoices</Th>
            <Th className="text-right">Sales</Th>
            <Th className="text-right">Purchases</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.fy}>
              <Td className="font-medium">FY 20{r.fy}</Td>
              <Td className="tabular text-right">{r.invoiceCount}</Td>
              <Td className="tabular text-right">{formatINR(r.sales)}</Td>
              <Td className="tabular text-right">{formatINR(r.purchases)}</Td>
              <Td>{r.closed ? <Badge color="gray">Closed</Badge> : r.fy === current ? <Badge color="green">Current</Badge> : <Badge color="blue">Open</Badge>}</Td>
              <Td className="text-right">
                {r.fy !== current && <FyLockButton companyId={ctx.companyId} fy={r.fy} closed={r.closed} />}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
