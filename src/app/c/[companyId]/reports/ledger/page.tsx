import Link from "next/link";
import { Card, Empty, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/gst/calc";
import { partyLedger } from "@/lib/reports/books";
import { ReportHeader, csvHref, reportContext } from "../shared";
import { PartyPicker } from "./party-picker";

export const metadata = { title: "Party ledger" };

const drcr = (p: number) => (p === 0 ? formatINR(0) : `${formatINR(Math.abs(p))} ${p > 0 ? "Dr" : "Cr"}`);

export default async function LedgerPage({ params, searchParams }: PageProps<"/c/[companyId]/reports/ledger">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { ctx, fy, from, to, base } = await reportContext(companyId, sp);
  const partyId = typeof sp.party === "string" ? sp.party : "";
  const parties = await db.party.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const ledger = partyId ? await partyLedger(ctx.companyId, partyId, from, to) : null;

  return (
    <>
      <ReportHeader
        title="Party ledger"
        subtitle="Dr = receivable from party, Cr = payable to party. Opening balance carries forward from earlier years."
        base={base}
        from={from}
        to={to}
        fy={fy}
        csv={ledger ? csvHref(base, { report: "ledger", party: partyId, from, to }) : undefined}
      />
      <div className="mb-4 max-w-sm">
        <PartyPicker parties={parties} value={partyId} />
      </div>
      {!ledger ? (
        <Card>
          <Empty>Select a party to view their statement.</Empty>
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Particulars</Th>
                <Th>Ref</Th>
                <Th className="text-right">Debit</Th>
                <Th className="text-right">Credit</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-background">
                <Td>{from}</Td>
                <Td colSpan={4} className="font-medium">
                  Opening balance
                </Td>
                <Td className="tabular text-right font-medium">{drcr(ledger.opening)}</Td>
              </tr>
              {ledger.entries.map((e, i) => (
                <tr key={i}>
                  <Td>{e.date}</Td>
                  <Td>{e.kind}</Td>
                  <Td>
                    {e.href ? (
                      <Link href={e.href} className="text-primary hover:underline">
                        {e.ref || "view"}
                      </Link>
                    ) : (
                      e.ref
                    )}
                  </Td>
                  <Td className="tabular text-right">{e.debit ? formatINR(e.debit) : ""}</Td>
                  <Td className="tabular text-right">{e.credit ? formatINR(e.credit) : ""}</Td>
                  <Td className="tabular text-right">{drcr(e.balance)}</Td>
                </tr>
              ))}
              <tr className="font-semibold">
                <Td colSpan={3}>Closing balance</Td>
                <Td className="tabular text-right">{formatINR(ledger.totals.debit)}</Td>
                <Td className="tabular text-right">{formatINR(ledger.totals.credit)}</Td>
                <Td className="tabular text-right">{drcr(ledger.closing)}</Td>
              </tr>
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
