import { ButtonLink, Card, Empty, Table, Td, Th } from "@/components/ui";
import { formatINR } from "@/lib/gst/calc";
import { stateName } from "@/lib/gst/states";
import { GSTR1_CSV, gstr1, type Gstr1 } from "@/lib/reports/gst-returns";
import { ReportHeader, csvHref, reportContext } from "../shared";

export const metadata = { title: "GSTR-1" };

function Section({ id, csv, count, taxable, tax, children }: { id: keyof Gstr1; csv: string; count: number; taxable?: number; tax?: number; children: React.ReactNode }) {
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div>
          <h2 className="font-semibold">{GSTR1_CSV[id].title}</h2>
          <p className="text-xs text-muted">
            {count} {count === 1 ? "record" : "records"}
            {taxable !== undefined && ` · Taxable ${formatINR(taxable)}`}
            {tax !== undefined && ` · Tax ${formatINR(tax)}`}
          </p>
        </div>
        {count > 0 && (
          <ButtonLink variant="secondary" href={csv} prefetch={false}>
            CSV
          </ButtonLink>
        )}
      </div>
      {count > 0 ? children : <Empty>Nothing to report.</Empty>}
    </Card>
  );
}

export default async function Gstr1Page({ params, searchParams }: PageProps<"/c/[companyId]/reports/gstr1">) {
  const { companyId } = await params;
  const { ctx, fy, from, to, base } = await reportContext(companyId, await searchParams);
  const data = await gstr1(ctx.companyId, from, to);
  const csv = (section: keyof Gstr1) => csvHref(base, { report: "gstr1", section, from, to });

  const sumBy = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);
  // Count distinct invoices for B2B/B2CL (rows are per rate).
  const distinct = (rows: Array<{ number: string }>) => new Set(rows.map((r) => r.number)).size;

  return (
    <>
      <ReportHeader
        title="GSTR-1"
        subtitle="Cancelled documents are excluded from all tables except Documents issued. Amounts are computed from issued documents."
        base={base}
        from={from}
        to={to}
        fy={fy}
      />

      <Section id="b2b" csv={csv("b2b")} count={distinct(data.b2b)} taxable={sumBy(data.b2b, (r) => r.taxable)} tax={sumBy(data.b2b, (r) => r.igst + r.cgst + r.sgst)}>
        <Table>
          <thead>
            <tr>
              <Th>GSTIN</Th>
              <Th>Party</Th>
              <Th>Invoice</Th>
              <Th>Date</Th>
              <Th>POS</Th>
              <Th className="text-right">Rate</Th>
              <Th className="text-right">Taxable</Th>
              <Th className="text-right">IGST</Th>
              <Th className="text-right">CGST</Th>
              <Th className="text-right">SGST</Th>
            </tr>
          </thead>
          <tbody>
            {data.b2b.map((r, i) => (
              <tr key={i}>
                <Td className="font-mono text-xs">{r.gstin}</Td>
                <Td>{r.name}</Td>
                <Td>{r.number}</Td>
                <Td>{r.date}</Td>
                <Td>{stateName(r.pos)}</Td>
                <Td className="text-right">{r.rate}%</Td>
                <Td className="tabular text-right">{formatINR(r.taxable)}</Td>
                <Td className="tabular text-right">{formatINR(r.igst)}</Td>
                <Td className="tabular text-right">{formatINR(r.cgst)}</Td>
                <Td className="tabular text-right">{formatINR(r.sgst)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="b2cl" csv={csv("b2cl")} count={distinct(data.b2cl)} taxable={sumBy(data.b2cl, (r) => r.taxable)} tax={sumBy(data.b2cl, (r) => r.igst)}>
        <Table>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Date</Th>
              <Th>POS</Th>
              <Th className="text-right">Invoice value</Th>
              <Th className="text-right">Rate</Th>
              <Th className="text-right">Taxable</Th>
              <Th className="text-right">IGST</Th>
            </tr>
          </thead>
          <tbody>
            {data.b2cl.map((r, i) => (
              <tr key={i}>
                <Td>{r.number}</Td>
                <Td>{r.date}</Td>
                <Td>{stateName(r.pos)}</Td>
                <Td className="tabular text-right">{formatINR(r.value)}</Td>
                <Td className="text-right">{r.rate}%</Td>
                <Td className="tabular text-right">{formatINR(r.taxable)}</Td>
                <Td className="tabular text-right">{formatINR(r.igst)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="b2cs" csv={csv("b2cs")} count={data.b2cs.length} taxable={sumBy(data.b2cs, (r) => r.taxable)} tax={sumBy(data.b2cs, (r) => r.igst + r.cgst + r.sgst)}>
        <Table>
          <thead>
            <tr>
              <Th>Place of supply</Th>
              <Th className="text-right">Rate</Th>
              <Th className="text-right">Taxable</Th>
              <Th className="text-right">IGST</Th>
              <Th className="text-right">CGST</Th>
              <Th className="text-right">SGST</Th>
            </tr>
          </thead>
          <tbody>
            {data.b2cs.map((r, i) => (
              <tr key={i}>
                <Td>
                  {r.pos} - {stateName(r.pos)}
                </Td>
                <Td className="text-right">{r.rate}%</Td>
                <Td className="tabular text-right">{formatINR(r.taxable)}</Td>
                <Td className="tabular text-right">{formatINR(r.igst)}</Td>
                <Td className="tabular text-right">{formatINR(r.cgst)}</Td>
                <Td className="tabular text-right">{formatINR(r.sgst)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      {(["cdnr", "cdnur"] as const).map((id) => (
        <Section key={id} id={id} csv={csv(id)} count={distinct(data[id])} taxable={sumBy(data[id], (r) => r.taxable)}>
          <Table>
            <thead>
              <tr>
                {id === "cdnr" && <Th>GSTIN</Th>}
                <Th>Party</Th>
                <Th>Note</Th>
                <Th>Type</Th>
                <Th>Date</Th>
                <Th>Against</Th>
                <Th className="text-right">Rate</Th>
                <Th className="text-right">Taxable</Th>
                <Th className="text-right">Tax</Th>
              </tr>
            </thead>
            <tbody>
              {data[id].map((r, i) => (
                <tr key={i}>
                  {id === "cdnr" && <Td className="font-mono text-xs">{r.gstin}</Td>}
                  <Td>{r.name}</Td>
                  <Td>{r.number}</Td>
                  <Td>{r.noteType === "C" ? "Credit" : "Debit"}</Td>
                  <Td>{r.date}</Td>
                  <Td>{r.originalNumber}</Td>
                  <Td className="text-right">{r.rate}%</Td>
                  <Td className="tabular text-right">{formatINR(r.taxable)}</Td>
                  <Td className="tabular text-right">{formatINR(r.igst + r.cgst + r.sgst)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ))}

      <Section id="hsn" csv={csv("hsn")} count={data.hsn.length} taxable={sumBy(data.hsn, (r) => r.taxable)} tax={sumBy(data.hsn, (r) => r.igst + r.cgst + r.sgst)}>
        <Table>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th>HSN</Th>
              <Th>UQC</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Rate</Th>
              <Th className="text-right">Taxable</Th>
              <Th className="text-right">IGST</Th>
              <Th className="text-right">CGST</Th>
              <Th className="text-right">SGST</Th>
            </tr>
          </thead>
          <tbody>
            {data.hsn.map((r, i) => (
              <tr key={i}>
                <Td>{r.type}</Td>
                <Td className="font-mono text-xs">{r.hsn || <span className="text-danger">missing</span>}</Td>
                <Td>{r.uqc}</Td>
                <Td className="tabular text-right">{Number(r.qty.toFixed(3))}</Td>
                <Td className="text-right">{r.rate}%</Td>
                <Td className="tabular text-right">{formatINR(r.taxable)}</Td>
                <Td className="tabular text-right">{formatINR(r.igst)}</Td>
                <Td className="tabular text-right">{formatINR(r.cgst)}</Td>
                <Td className="tabular text-right">{formatINR(r.sgst)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="docsIssued" csv={csv("docsIssued")} count={data.docsIssued.length}>
        <Table>
          <thead>
            <tr>
              <Th>Nature of document</Th>
              <Th>From</Th>
              <Th>To</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Cancelled</Th>
            </tr>
          </thead>
          <tbody>
            {data.docsIssued.map((r, i) => (
              <tr key={i}>
                <Td>{r.nature}</Td>
                <Td>{r.from}</Td>
                <Td>{r.to}</Td>
                <Td className="text-right">{r.total}</Td>
                <Td className="text-right">{r.cancelled}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </>
  );
}
