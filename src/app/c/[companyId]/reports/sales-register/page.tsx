import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Card, Empty, Table, Td, Th } from "@/components/ui";
import { kindOfType } from "@/lib/doc-kinds";
import { formatINR } from "@/lib/gst/calc";
import { salesRegister } from "@/lib/reports/books";
import { ReportHeader, csvHref, reportContext } from "../shared";

export const metadata = { title: "Sales register" };

const TYPE = { INVOICE: "Invoice", CREDIT_NOTE: "Credit note", DEBIT_NOTE: "Debit note" } as Record<string, string>;

export default async function SalesRegisterPage({ params, searchParams }: PageProps<"/c/[companyId]/reports/sales-register">) {
  const { companyId } = await params;
  const { ctx, fy, from, to, base } = await reportContext(companyId, await searchParams);
  const rows = await salesRegister(ctx.companyId, from, to);
  const t = rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst, igst: a.igst + r.igst, total: a.total + r.total }), {
    taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0,
  });

  return (
    <>
      <ReportHeader title="Sales register" subtitle="Credit notes are shown as negative." base={base} from={from} to={to} fy={fy} csv={csvHref(base, { report: "sales", from, to })} />
      <Card>
        {rows.length === 0 ? (
          <Empty>No sales in this period.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Number</Th>
                <Th>Party</Th>
                <Th>GSTIN</Th>
                <Th className="text-right">Taxable</Th>
                <Th className="text-right">CGST</Th>
                <Th className="text-right">SGST</Th>
                <Th className="text-right">IGST</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.status === "CANCELLED" ? "text-muted" : ""}>
                  <Td>{r.date}</Td>
                  <Td>{TYPE[r.type]}</Td>
                  <Td>
                    <Link href={`/c/${ctx.companyId}/${kindOfType(r.type)}/${r.id}`} className="text-primary hover:underline">
                      {r.number}
                    </Link>
                    {r.status === "CANCELLED" && (
                      <span className="ml-1">
                        <StatusBadge status="CANCELLED" />
                      </span>
                    )}
                  </Td>
                  <Td>{r.party}</Td>
                  <Td className="font-mono text-xs">{r.gstin}</Td>
                  <Td className="tabular text-right">{formatINR(r.taxable)}</Td>
                  <Td className="tabular text-right">{formatINR(r.cgst)}</Td>
                  <Td className="tabular text-right">{formatINR(r.sgst)}</Td>
                  <Td className="tabular text-right">{formatINR(r.igst)}</Td>
                  <Td className="tabular text-right">{formatINR(r.total)}</Td>
                </tr>
              ))}
              <tr className="font-semibold">
                <Td colSpan={5}>Total</Td>
                <Td className="tabular text-right">{formatINR(t.taxable)}</Td>
                <Td className="tabular text-right">{formatINR(t.cgst)}</Td>
                <Td className="tabular text-right">{formatINR(t.sgst)}</Td>
                <Td className="tabular text-right">{formatINR(t.igst)}</Td>
                <Td className="tabular text-right">{formatINR(t.total)}</Td>
              </tr>
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
