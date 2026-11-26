import { Download, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst/calc";
import { stateName } from "@/lib/gst/states";
import { ACCEPT_AS, KIND_LABEL, loadReceived, matchCandidates, type SharedSnapshot } from "@/lib/sharing";
import { requireCompany } from "@/lib/tenant";
import { canActOn, STATUS_BADGE, visibleKinds } from "../access";
import { MatchPayments, ReceivedActions } from "./received-actions";

export const metadata = { title: "Received document" };

const money = (rupees: number) => formatINR(toPaise(rupees));

export default async function ReceivedDocPage({ params }: PageProps<"/c/[companyId]/received/[shareId]">) {
  const { companyId, shareId } = await params;
  const ctx = await requireCompany(companyId);
  const share = await loadReceived(ctx.companyId, shareId);
  if (!share || !visibleKinds(ctx).includes(share.kind)) notFound();
  if (!share.readAt) await db.sharedDocument.update({ where: { id: share.id }, data: { readAt: new Date() } });

  const s = share.snapshot;
  const isPayment = share.kind === "PAYMENT";
  const label = KIND_LABEL[share.kind];
  const base = `/c/${ctx.companyId}`;
  const as = ACCEPT_AS[share.kind];
  const act = canActOn(ctx, share.kind) && share.status !== "WITHDRAWN";
  // Payments we may have entered by hand before the sender told us (avoid a duplicate).
  const matches = isPayment && act && share.status !== "ACCEPTED" ? await matchCandidates(db, ctx.companyId, share) : [];
  const accepts =
    share.status === "ACCEPTED" || !act || !as
      ? []
      : as === "paymentReceived"
        ? [{ label: "Confirm payment", target: "default" as const }]
        : as === "purchase"
        ? [{ label: "Add to purchases", target: "default" as const }]
        : as === "purchaseOrder"
          ? [{ label: "Create purchase order", target: "default" as const }]
          : [
              { label: "Create invoice", target: "invoice" as const },
              { label: "Create quotation", target: "quotation" as const },
            ];
  const acceptedHref =
    share.status === "ACCEPTED" && share.acceptedRefId
      ? as === "paymentReceived"
        ? `${base}/payments/${share.acceptedRefId}`
        : as === "purchase"
        ? `${base}/purchases/${share.acceptedRefId}`
        : as === "purchaseOrder"
          ? `${base}/purchase-orders/${share.acceptedRefId}`
          : as === "sale"
            ? (await db.document.findFirst({ where: { id: share.acceptedRefId, companyId: ctx.companyId }, select: { type: true } }))?.type === "QUOTATION"
              ? `${base}/quotations/${share.acceptedRefId}`
              : `${base}/invoices/${share.acceptedRefId}`
            : null
      : null;

  return (
    <>
      <Link href={`${base}/received`} className="text-xs text-primary hover:underline">
        ← Received
      </Link>
      <PageHeader
        title={`${label} ${share.number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge color={STATUS_BADGE[share.status].color}>{STATUS_BADGE[share.status].label}</Badge>
            from <b>{s.from.name}</b> · {s.date}
          </span>
        }
        actions={
          isPayment ? undefined : <a href={`${base}/received/${share.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-subtle">
            <FileText size={15} /> PDF
          </a>
        }
      />

      <div className="flex flex-col gap-3">
        {share.status === "WITHDRAWN" && <Alert kind="warning">{s.from.name} withdrew this {isPayment ? "payment (deleted it" : "document (cancelled it"} on their side).</Alert>}
        {share.updatedBySender && share.status !== "WITHDRAWN" && (
          <Alert kind="warning">{s.from.name} changed this document after it arrived. {share.status === "ACCEPTED" ? "Check your entry still matches." : "You're seeing the latest version."}</Alert>
        )}
        {share.status === "REJECTED" && <Alert kind="info">You rejected this{share.rejectReason ? `: ${share.rejectReason}` : "."} You can still add it if you change your mind.</Alert>}
        {share.status === "ACCEPTED" && (
          <Alert kind="success">
            {isPayment ? "Confirmed: it's in your payments received." : as ? "Added to your books." : "Marked as recorded."}{" "}
            {acceptedHref && (
              <Link href={acceptedHref} className="font-semibold underline underline-offset-2">
                Open your entry
              </Link>
            )}
          </Alert>
        )}
        {!as && share.status === "NEW" && (
          <Alert kind="info">
            Credit and debit notes from suppliers can&apos;t be added to your purchases automatically yet. Adjust the related purchase invoice{s.originalNumber ? ` (${s.originalNumber})` : ""}, then mark this as recorded.
          </Alert>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        {isPayment ? (
          <div className="flex flex-col gap-4">
            <PaymentDetails s={s} />
            {matches.length > 0 && (
              <Card className="p-5">
                <h2 className="font-semibold">Did you already record this?</h2>
                <p className="mb-3 mt-1 text-sm text-muted">
                  These payments from {s.from.name} are already in your books. If one of them is this payment, match it: no new entry is added, and {s.from.name} sees it
                  as confirmed.
                </p>
                <MatchPayments companyId={ctx.companyId} shareId={share.id} candidates={matches} base={base} />
              </Card>
            )}
          </div>
        ) : (
        <Card className="overflow-hidden">
          <CardHeader title="Items" description={`${s.isInterstate ? "IGST" : "CGST + SGST"} · place of supply ${stateName(s.placeOfSupply) ?? s.placeOfSupply}${s.pricesIncludeTax ? " · prices include GST" : ""}`} />
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>HSN/SAC</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Rate</Th>
                <Th className="text-right">GST</Th>
                <Th className="text-right">Taxable</Th>
              </tr>
            </thead>
            <tbody>
              {s.items.map((i, n) => (
                <tr key={n}>
                  <Td>{i.description}</Td>
                  <Td className="font-mono text-xs">{i.hsnSac}</Td>
                  <Td className="tabular text-right">
                    {i.qty} {i.unit}
                  </Td>
                  <Td className="tabular text-right">
                    {money(i.rate)}
                    {i.discountPct > 0 && <span className="block text-xs text-muted">−{i.discountPct}%</span>}
                  </Td>
                  <Td className="tabular text-right">{i.gstRate}%</Td>
                  <Td className="tabular text-right">{money(i.taxable)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <dl className="tabular grid grid-cols-2 gap-y-1 border-t border-border bg-surface-2 px-5 py-3.5 text-sm">
            <dt className="text-muted">Taxable value</dt>
            <dd className="text-right">{money(s.totals.taxable)}</dd>
            {s.isInterstate ? (
              <>
                <dt className="text-muted">IGST</dt>
                <dd className="text-right">{money(s.totals.igst)}</dd>
              </>
            ) : (
              <>
                <dt className="text-muted">CGST + SGST</dt>
                <dd className="text-right">{money(s.totals.cgst + s.totals.sgst)}</dd>
              </>
            )}
            {s.totals.roundOff !== 0 && (
              <>
                <dt className="text-muted">Round off</dt>
                <dd className="text-right">{money(s.totals.roundOff)}</dd>
              </>
            )}
            <dt className="font-semibold">Total</dt>
            <dd className="text-right font-semibold">{money(s.totals.grandTotal)}</dd>
          </dl>
        </Card>
        )}

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            {matches.some((m) => m.sameAmount) && (
              <div className="mb-3">
                <Alert kind="warning">You may already have recorded this payment. Match it with your entry instead of confirming, to avoid a duplicate.</Alert>
              </div>
            )}
            <ReceivedActions companyId={ctx.companyId} shareId={share.id} accepts={accepts} recordOnly={!as && act && share.status !== "ACCEPTED"} canReject={act && share.status === "NEW"} />
            {accepts.length > 0 && (
              <p className="mt-3 text-xs text-muted">
                {isPayment
                  ? "Opens your payment form, filled in from this payment, so you can check the amount and the invoices it settles before saving."
                  : "Opens your own form, filled in from this document, so you can check it and pick your products before saving."}
              </p>
            )}
          </Card>
          <Card className="p-5 text-sm">
            <h2 className="mb-2 font-semibold">From</h2>
            <p className="font-medium">{s.from.legalName}</p>
            <p className="font-mono text-xs text-muted">{s.from.gstin}</p>
            {s.from.address && <p className="mt-1 text-muted">{s.from.address}</p>}
            {(s.from.email || s.from.phone) && <p className="mt-1 text-muted">{[s.from.email, s.from.phone].filter(Boolean).join(" · ")}</p>}
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {s.dueDate && (
                <>
                  <dt className="text-muted">Due</dt>
                  <dd>{s.dueDate}</dd>
                </>
              )}
              {s.expectedDate && (
                <>
                  <dt className="text-muted">Deliver by</dt>
                  <dd>{s.expectedDate}</dd>
                </>
              )}
              {s.paymentTerms && (
                <>
                  <dt className="text-muted">Payment terms</dt>
                  <dd>{s.paymentTerms}</dd>
                </>
              )}
              {s.originalNumber && (
                <>
                  <dt className="text-muted">Against</dt>
                  <dd>{s.originalNumber}</dd>
                </>
              )}
              {s.reason && (
                <>
                  <dt className="text-muted">Reason</dt>
                  <dd>{s.reason}</dd>
                </>
              )}
            </dl>
            {s.notes && <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-xs text-muted">{s.notes}</p>}
            {!isPayment && (
              <a href={`${base}/received/${share.id}/pdf?download`} className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                <Download size={13} /> Download PDF
              </a>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

const MODE_LABEL: Record<string, string> = { BANK: "Bank transfer / NEFT", UPI: "UPI", CASH: "Cash", CHEQUE: "Cheque", CARD: "Card", OTHER: "Other" };

/** A payment the sender says they made to us, and which of our invoices it's for. */
function PaymentDetails({ s }: { s: SharedSnapshot }) {
  const p = s.payment;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Payment" description={`Paid to ${s.to.name}`} />
      <dl className="tabular grid grid-cols-2 gap-x-4 gap-y-2 px-5 pb-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Amount</dt>
          <dd className="text-lg font-semibold">{money(s.totals.grandTotal)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Date</dt>
          <dd>{s.date}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Mode</dt>
          <dd>{MODE_LABEL[p?.mode ?? ""] ?? p?.mode ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Reference</dt>
          <dd className="break-all">{p?.reference || "—"}</dd>
        </div>
      </dl>
      {p && p.against.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Against your invoice</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {p.against.map((a, i) => (
              <tr key={i}>
                <Td>{a.number}</Td>
                <Td className="tabular text-right">{money(a.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="border-t border-border px-5 py-3.5 text-sm text-muted">Not linked to any of your invoices: an advance or on-account payment.</p>
      )}
    </Card>
  );
}
