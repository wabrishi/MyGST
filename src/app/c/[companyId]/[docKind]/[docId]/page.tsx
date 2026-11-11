import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { Alert, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { DOC_KINDS, isDocKind, kindOfType } from "@/lib/doc-kinds";
import { canEditDoc, loadDocument, paymentStatus } from "@/lib/documents";
import { formatINR } from "@/lib/gst/calc";
import { creditNoteDeadline, todayIST } from "@/lib/gst/fy";
import { can } from "@/lib/permissions";
import { requireCompany } from "@/lib/tenant";
import { DocActions } from "./doc-actions";

export default async function DocViewPage({ params }: PageProps<"/c/[companyId]/[docKind]/[docId]">) {
  const { companyId, docKind, docId } = await params;
  if (!isDocKind(docKind)) notFound();
  const ctx = await requireCompany(companyId);
  const doc = await loadDocument(ctx.companyId, docId);
  if (!doc || doc.type !== DOC_KINDS[docKind].type) notFound();
  if (!can(ctx.role, "reports.view") && doc.createdById !== ctx.user.id) notFound();

  const cfg = DOC_KINDS[docKind];
  const base = `/c/${ctx.companyId}`;
  const receivable = doc.type === "INVOICE" || doc.type === "DEBIT_NOTE";
  const status = doc.status === "ISSUED" && receivable ? paymentStatus(doc) : doc.status;
  const party = await db.party.findFirst({ where: { id: doc.partyId, companyId: ctx.companyId }, select: { email: true } });
  const convertedTo = doc.convertedToId
    ? await db.document.findFirst({ where: { id: doc.convertedToId, companyId: ctx.companyId }, select: { id: true, number: true } })
    : null;

  return (
    <>
      <PageHeader
        title={`${cfg.singular} ${doc.number}`}
        subtitle={
          <span className="flex items-center gap-2">
            <StatusBadge status={status} /> {doc.partyName} · {doc.date}
          </span>
        }
        actions={
          <DocActions
            companyId={ctx.companyId}
            kind={docKind}
            docId={doc.id}
            status={doc.status}
            type={doc.type}
            balance={doc.balance}
            partyEmail={party?.email ?? ""}
            canEdit={canEditDoc(ctx, doc)}
            canCancel={can(ctx.role, "docs.cancel")}
            canPay={can(ctx.role, "payments.write")}
          />
        }
      />

      <div className="mb-4 flex flex-col gap-2">
        {doc.type === "INVOICE" && doc.status === "ISSUED" && todayIST() > creditNoteDeadline(doc.date) && (
          <Alert kind="warning">
            The deadline to issue credit notes for this invoice ({creditNoteDeadline(doc.date)}) has passed.
          </Alert>
        )}
        {convertedTo && (
          <Alert kind="info">
            Converted to invoice{" "}
            <Link className="underline" href={`${base}/invoices/${convertedTo.id}`}>
              {convertedTo.number}
            </Link>
            .
          </Alert>
        )}
        {doc.originalDoc && (
          <Alert kind="info">
            Issued against invoice{" "}
            <Link className="underline" href={`${base}/invoices/${doc.originalDoc.id}`}>
              {doc.originalDoc.number}
            </Link>{" "}
            · Reason: {doc.noteReason}
          </Alert>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden">
          <iframe src={`${base}/${docKind}/${doc.id}/pdf`} className="h-[80vh] w-full" title="Document preview" />
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="tabular p-4">
            <dl className="grid grid-cols-2 gap-y-1.5">
              <dt className="text-muted">Taxable</dt>
              <dd className="text-right">{formatINR(doc.taxable)}</dd>
              <dt className="text-muted">Tax</dt>
              <dd className="text-right">{formatINR(doc.cgst + doc.sgst + doc.igst)}</dd>
              <dt className="font-semibold">Total</dt>
              <dd className="text-right font-semibold">{formatINR(doc.grandTotal)}</dd>
              {receivable && doc.status === "ISSUED" && (
                <>
                  <dt className="text-muted">Received</dt>
                  <dd className="text-right">{formatINR(doc.paid)}</dd>
                  {doc.credited > 0 && (
                    <>
                      <dt className="text-muted">Credit notes</dt>
                      <dd className="text-right">{formatINR(doc.credited)}</dd>
                    </>
                  )}
                  <dt className="font-semibold">Balance</dt>
                  <dd className="text-right font-semibold">{formatINR(doc.balance)}</dd>
                </>
              )}
            </dl>
          </Card>

          {doc.payments.length > 0 && (
            <Card>
              <h3 className="px-3 pt-3 font-semibold">Payments</h3>
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Mode</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {doc.payments.map((p) => (
                    <tr key={p.paymentId}>
                      <Td>
                        <Link href={`${base}/payments/${p.paymentId}`} className="text-primary hover:underline">
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

          {doc.notesIssued.length > 0 && (
            <Card>
              <h3 className="px-3 pt-3 font-semibold">Credit / debit notes</h3>
              <Table>
                <tbody>
                  {doc.notesIssued.map((n) => (
                    <tr key={n.id}>
                      <Td>
                        <Link href={`${base}/${kindOfType(n.type)}/${n.id}`} className="text-primary hover:underline">
                          {n.number}
                        </Link>
                      </Td>
                      <Td className="tabular text-right">
                        {n.type === "CREDIT_NOTE" ? "−" : "+"}
                        {formatINR(n.amount)}
                      </Td>
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
