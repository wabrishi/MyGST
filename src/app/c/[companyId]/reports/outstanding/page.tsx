import Link from "next/link";
import { Card, Empty, Table, Td, Th, cn } from "@/components/ui";
import { formatINR } from "@/lib/gst/calc";
import { AGE_BUCKETS, ageing } from "@/lib/reports/books";
import { ReportHeader, csvHref, reportContext } from "../shared";

export const metadata = { title: "Outstanding" };

export default async function OutstandingPage({ params, searchParams }: PageProps<"/c/[companyId]/reports/outstanding">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { ctx, fy, from, to, base } = await reportContext(companyId, sp);
  const side = sp.side === "payable" ? "payable" : "receivable";
  const data = await ageing(ctx.companyId, side);
  const tab = (s: string, label: string) => (
    <Link
      href={`${base}/outstanding?side=${s}`}
      className={cn("-mb-px border-b-2 px-3 py-2", side === s ? "border-primary font-medium text-primary" : "border-transparent text-muted")}
    >
      {label}
    </Link>
  );

  return (
    <>
      <ReportHeader
        title="Outstanding & ageing"
        subtitle={`As of today · ${side === "receivable" ? "Receivable" : "Payable"} ${formatINR(data.grand)} · aged from due date (or document date)`}
        base={base}
        from={from}
        to={to}
        fy={fy}
        noRange
        csv={csvHref(base, { report: "ageing", side })}
      />
      <div className="mb-4 flex gap-1 border-b border-border">
        {tab("receivable", "Receivables (customers)")}
        {tab("payable", "Payables (suppliers)")}
      </div>
      <Card>
        {data.rows.length === 0 ? (
          <Empty>Nothing outstanding. 🎉</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Party</Th>
                {AGE_BUCKETS.map((b) => (
                  <Th key={b} className="text-right">
                    {b}
                  </Th>
                ))}
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.partyId}>
                  <Td>
                    <Link href={`${base}/ledger?party=${r.partyId}`} className="text-primary hover:underline">
                      {r.name}
                    </Link>
                  </Td>
                  {r.buckets.map((v, i) => (
                    <Td key={i} className={cn("tabular text-right", i === 4 && v > 0 && "text-danger")}>
                      {v ? formatINR(v) : "—"}
                    </Td>
                  ))}
                  <Td className="tabular text-right font-semibold">{formatINR(r.total)}</Td>
                </tr>
              ))}
              <tr className="font-semibold">
                <Td>Total</Td>
                {data.totals.map((v, i) => (
                  <Td key={i} className="tabular text-right">
                    {formatINR(v)}
                  </Td>
                ))}
                <Td className="tabular text-right">{formatINR(data.grand)}</Td>
              </tr>
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
