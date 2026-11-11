import Link from "next/link";
import { Badge, Card, Empty, Table, Td, Th } from "@/components/ui";
import { formatINR } from "@/lib/gst/calc";
import { purchaseRegister } from "@/lib/reports/books";
import { ReportHeader, csvHref, reportContext } from "../shared";

export const metadata = { title: "Purchase register" };

const ITC = { ELIGIBLE: "Eligible", CAPITAL_GOODS: "Capital goods", INELIGIBLE: "Ineligible" } as const;

export default async function PurchaseRegisterPage({ params, searchParams }: PageProps<"/c/[companyId]/reports/purchase-register">) {
  const { companyId } = await params;
  const { ctx, fy, from, to, base } = await reportContext(companyId, await searchParams);
  const rows = await purchaseRegister(ctx.companyId, from, to);
  const t = rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, tax: a.tax + r.cgst + r.sgst + r.igst, total: a.total + r.total }), { taxable: 0, tax: 0, total: 0 });

  return (
    <>
      <ReportHeader title="Purchase register" base={base} from={from} to={to} fy={fy} csv={csvHref(base, { report: "purchases", from, to })} />
      <Card>
        {rows.length === 0 ? (
          <Empty>No purchases in this period.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Bill no.</Th>
                <Th>Supplier</Th>
                <Th>GSTIN</Th>
                <Th>ITC</Th>
                <Th className="text-right">Taxable</Th>
                <Th className="text-right">GST</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.cancelled ? "text-muted line-through" : ""}>
                  <Td>{r.date}</Td>
                  <Td>
                    <Link href={`/c/${ctx.companyId}/purchases/${r.id}`} className="text-primary hover:underline">
                      {r.number}
                    </Link>
                  </Td>
                  <Td>{r.party}</Td>
                  <Td className="font-mono text-xs">{r.gstin}</Td>
                  <Td>
                    <Badge color={r.itc === "INELIGIBLE" ? "red" : "green"}>{ITC[r.itc]}</Badge>
                    {r.reverseCharge && <span className="ml-1 text-xs text-muted">RCM</span>}
                  </Td>
                  <Td className="tabular text-right">{formatINR(r.taxable)}</Td>
                  <Td className="tabular text-right">{formatINR(r.cgst + r.sgst + r.igst)}</Td>
                  <Td className="tabular text-right">{formatINR(r.total)}</Td>
                </tr>
              ))}
              <tr className="font-semibold">
                <Td colSpan={5}>Total</Td>
                <Td className="tabular text-right">{formatINR(t.taxable)}</Td>
                <Td className="tabular text-right">{formatINR(t.tax)}</Td>
                <Td className="tabular text-right">{formatINR(t.total)}</Td>
              </tr>
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
