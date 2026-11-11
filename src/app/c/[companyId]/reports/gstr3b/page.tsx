import { Alert, Card, Table, Td, Th } from "@/components/ui";
import { formatINR } from "@/lib/gst/calc";
import { gstr3b, type TaxBucket } from "@/lib/reports/gst-returns";
import { ReportHeader, reportContext } from "../shared";

export const metadata = { title: "GSTR-3B" };

function Row({ label, b, showTaxable = true }: { label: string; b: TaxBucket; showTaxable?: boolean }) {
  return (
    <tr>
      <Td>{label}</Td>
      <Td className="tabular text-right">{showTaxable ? formatINR(b.taxable) : ""}</Td>
      <Td className="tabular text-right">{formatINR(b.igst)}</Td>
      <Td className="tabular text-right">{formatINR(b.cgst)}</Td>
      <Td className="tabular text-right">{formatINR(b.sgst)}</Td>
    </tr>
  );
}

const Head = ({ first }: { first: string }) => (
  <thead>
    <tr>
      <Th>{first}</Th>
      <Th className="text-right">Taxable value</Th>
      <Th className="text-right">IGST</Th>
      <Th className="text-right">CGST</Th>
      <Th className="text-right">SGST/UTGST</Th>
    </tr>
  </thead>
);

export default async function Gstr3bPage({ params, searchParams }: PageProps<"/c/[companyId]/reports/gstr3b">) {
  const { companyId } = await params;
  const { ctx, fy, from, to, base } = await reportContext(companyId, await searchParams);
  const r = await gstr3b(ctx.companyId, from, to);
  const totalNet = r.net.igst + r.net.cgst + r.net.sgst;

  return (
    <>
      <ReportHeader title="GSTR-3B summary" subtitle="Usually filed monthly — pick a month or quarter above." base={base} from={from} to={to} fy={fy} />
      <div className="mb-4">
        <Alert kind="info">
          This is a working summary from your books. Verify ITC against GSTR-2B before filing — only credit reflected in GSTR-2B is claimable.
        </Alert>
      </div>

      <Card className="mb-4">
        <h2 className="p-3 font-semibold">3.1 Outward supplies and inward supplies liable to reverse charge</h2>
        <Table>
          <Head first="Nature of supplies" />
          <tbody>
            <Row label="(a) Outward taxable supplies (other than zero rated, nil rated and exempted)" b={r.outward} />
            <Row label="(c) Other outward supplies (nil rated, exempted)" b={r.nilExempt} />
            <Row label="(d) Inward supplies (liable to reverse charge)" b={r.inwardRcm} />
            {r.outwardRcm.taxable !== 0 && <Row label="Outward supplies where recipient pays tax (reverse charge) — not your liability" b={r.outwardRcm} />}
          </tbody>
        </Table>
      </Card>

      <Card className="mb-4">
        <h2 className="p-3 font-semibold">4. Eligible ITC</h2>
        <Table>
          <Head first="Details" />
          <tbody>
            <Row label="(A) ITC available (incl. reverse charge paid)" b={r.itcEligible} />
            <Row label="(D) Ineligible ITC — Sec 17(5) / others" b={r.itcIneligible} />
          </tbody>
        </Table>
      </Card>

      <Card>
        <h2 className="p-3 font-semibold">Net tax position (before cross-utilisation of credit)</h2>
        <Table>
          <thead>
            <tr>
              <Th />
              <Th className="text-right">IGST</Th>
              <Th className="text-right">CGST</Th>
              <Th className="text-right">SGST/UTGST</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>Total liability</Td>
              <Td className="tabular text-right">{formatINR(r.liability.igst)}</Td>
              <Td className="tabular text-right">{formatINR(r.liability.cgst)}</Td>
              <Td className="tabular text-right">{formatINR(r.liability.sgst)}</Td>
            </tr>
            <tr>
              <Td>Less: eligible ITC</Td>
              <Td className="tabular text-right">{formatINR(r.itcEligible.igst)}</Td>
              <Td className="tabular text-right">{formatINR(r.itcEligible.cgst)}</Td>
              <Td className="tabular text-right">{formatINR(r.itcEligible.sgst)}</Td>
            </tr>
            <tr className="font-semibold">
              <Td>Net payable (negative = credit carried forward)</Td>
              <Td className="tabular text-right">{formatINR(r.net.igst)}</Td>
              <Td className="tabular text-right">{formatINR(r.net.cgst)}</Td>
              <Td className="tabular text-right">{formatINR(r.net.sgst)}</Td>
            </tr>
          </tbody>
        </Table>
        <p className="p-3 text-sm">
          Overall: <b>{totalNet >= 0 ? `${formatINR(totalNet)} payable` : `${formatINR(-totalNet)} excess credit`}</b>. IGST credit is first set off against
          IGST, then CGST and SGST as per Sec 49; the portal computes the final cash payment.
        </p>
      </Card>
    </>
  );
}
