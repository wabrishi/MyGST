import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { ButtonLink, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { paymentStatus } from "@/lib/documents";
import { formatINR } from "@/lib/gst/calc";
import { stateName } from "@/lib/gst/states";
import { can } from "@/lib/permissions";
import { loadPurchase } from "@/lib/purchases";
import { requireCompanyPage } from "@/lib/tenant";
import { CancelBillButton } from "./cancel-button";

export const metadata = { title: "Purchase bill" };

const ITC_LABEL = { ELIGIBLE: "Eligible (inputs/services)", CAPITAL_GOODS: "Eligible (capital goods)", INELIGIBLE: "Ineligible" } as const;

export default async function PurchaseViewPage({ params }: PageProps<"/c/[companyId]/purchases/[billId]">) {
  const { companyId, billId } = await params;
  const ctx = await requireCompanyPage(companyId, "purchases.view");
  const b = await loadPurchase(ctx.companyId, billId);
  if (!b) notFound();
  const base = `/c/${ctx.companyId}`;
  const writable = can(ctx.role, "purchases.write") && !b.cancelled;

  return (
    <>
      <PageHeader
        title={`Bill ${b.billNumber}`}
        subtitle={
          <span className="flex items-center gap-2">
            <StatusBadge status={b.cancelled ? "CANCELLED" : paymentStatus({ grandTotal: b.grandTotal, balance: b.balance, dueDate: b.dueDate })} />
            {b.partyName} · {b.billDate}
          </span>
        }
        actions={
          writable && (
            <div className="flex gap-2">
              {b.balance > 0 && can(ctx.role, "payments.write") && <ButtonLink href={`${base}/payments/new?bill=${b.id}`}>Record payment</ButtonLink>}
              <ButtonLink variant="secondary" href={`${base}/purchases/${b.id}/edit`}>
                Edit
              </ButtonLink>
              <CancelBillButton companyId={ctx.companyId} billId={b.id} />
            </div>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          <Card className="grid gap-3 p-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted">Supplier GSTIN</div>
              <div className="font-mono">{b.partyGstin || "Unregistered"}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Place of supply</div>
              <div>{stateName(b.placeOfSupply)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">ITC</div>
              <div>
                {ITC_LABEL[b.itcType]}
                {b.reverseCharge && " · Reverse charge"}
              </div>
            </div>
          </Card>
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>HSN</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Rate</Th>
                  <Th className="text-right">Taxable</Th>
                  <Th className="text-right">GST</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {b.items.map((i, idx) => (
                  <tr key={idx}>
                    <Td>{i.description}</Td>
                    <Td className="font-mono text-xs">{i.hsnSac}</Td>
                    <Td className="tabular text-right">
                      {i.qty} {i.unit}
                    </Td>
                    <Td className="tabular text-right">{i.rate}</Td>
                    <Td className="tabular text-right">{formatINR(i.taxable)}</Td>
                    <Td className="tabular text-right">
                      {formatINR(i.cgst + i.sgst + i.igst)} <span className="text-xs text-muted">@{i.gstRate}%</span>
                    </Td>
                    <Td className="tabular text-right">{formatINR(i.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          {b.notes && <p className="whitespace-pre-wrap text-muted">{b.notes}</p>}
        </div>
        <div className="flex flex-col gap-4">
          <Card className="tabular p-4">
            <dl className="grid grid-cols-2 gap-y-1.5">
              <dt className="text-muted">Taxable</dt>
              <dd className="text-right">{formatINR(b.taxable)}</dd>
              {b.isInterstate ? (
                <>
                  <dt className="text-muted">IGST</dt>
                  <dd className="text-right">{formatINR(b.igst)}</dd>
                </>
              ) : (
                <>
                  <dt className="text-muted">CGST</dt>
                  <dd className="text-right">{formatINR(b.cgst)}</dd>
                  <dt className="text-muted">SGST</dt>
                  <dd className="text-right">{formatINR(b.sgst)}</dd>
                </>
              )}
              <dt className="text-muted">Round off</dt>
              <dd className="text-right">{formatINR(b.roundOff)}</dd>
              <dt className="font-semibold">Total</dt>
              <dd className="text-right font-semibold">{formatINR(b.grandTotal)}</dd>
              <dt className="text-muted">Paid</dt>
              <dd className="text-right">{formatINR(b.paid)}</dd>
              <dt className="font-semibold">Balance</dt>
              <dd className="text-right font-semibold">{formatINR(b.balance)}</dd>
            </dl>
          </Card>
          {b.payments.length > 0 && (
            <Card>
              <h3 className="px-3 pt-3 font-semibold">Payments</h3>
              <Table>
                <tbody>
                  {b.payments.map((p) => (
                    <tr key={p.id}>
                      <Td>
                        <Link href={`${base}/payments/${p.id}`} className="text-primary hover:underline">
                          {p.date}
                        </Link>
                      </Td>
                      <Td>{p.mode}</Td>
                      <Td className="tabular text-right">{formatINR(p.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
