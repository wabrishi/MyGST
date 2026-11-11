import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { isoOf } from "@/lib/documents";
import { kindOfType } from "@/lib/doc-kinds";
import { formatINR, toPaise } from "@/lib/gst/calc";
import { requireCompanyPage } from "@/lib/tenant";
import { DeletePaymentButton } from "./delete-button";

export const metadata = { title: "Payment" };

export default async function PaymentPage({ params }: PageProps<"/c/[companyId]/payments/[paymentId]">) {
  const { companyId, paymentId } = await params;
  const ctx = await requireCompanyPage(companyId, "payments.write");
  const p = await db.payment.findFirst({
    where: { id: paymentId, companyId: ctx.companyId },
    include: {
      party: { select: { id: true, name: true } },
      allocations: {
        include: {
          document: { select: { id: true, number: true, type: true } },
          purchaseBill: { select: { id: true, billNumber: true } },
        },
      },
    },
  });
  if (!p) notFound();
  const amount = toPaise(p.amount.toNumber());
  const allocated = p.allocations.reduce((s, a) => s + toPaise(a.amount.toNumber()), 0);
  const base = `/c/${ctx.companyId}`;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Payment ${p.direction === "RECEIVED" ? "received from" : "made to"} ${p.party.name}`}
        subtitle={`${isoOf(p.date)} · ${p.mode}${p.reference ? ` · Ref ${p.reference}` : ""}`}
        actions={<DeletePaymentButton companyId={ctx.companyId} paymentId={p.id} />}
      />
      <Card className="tabular mb-4 grid grid-cols-3 gap-4 p-4">
        <div>
          <div className="text-xs text-muted">Amount</div>
          <div className="text-lg font-semibold">{formatINR(amount)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Allocated</div>
          <div className="text-lg font-semibold">{formatINR(allocated)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Advance / unallocated</div>
          <div className="text-lg font-semibold">{formatINR(amount - allocated)}</div>
        </div>
      </Card>
      {p.allocations.length > 0 && (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Document</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {p.allocations.map((a) => (
                <tr key={a.id}>
                  <Td>
                    {a.document ? (
                      <Link href={`${base}/${kindOfType(a.document.type)}/${a.document.id}`} className="text-primary hover:underline">
                        {a.document.number}
                      </Link>
                    ) : a.purchaseBill ? (
                      <Link href={`${base}/purchases/${a.purchaseBill.id}`} className="text-primary hover:underline">
                        Bill {a.purchaseBill.billNumber}
                      </Link>
                    ) : null}
                  </Td>
                  <Td className="tabular text-right">{formatINR(toPaise(a.amount.toNumber()))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {p.notes && <p className="mt-4 whitespace-pre-wrap text-muted">{p.notes}</p>}
    </div>
  );
}
