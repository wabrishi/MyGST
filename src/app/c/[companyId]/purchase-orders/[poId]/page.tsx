import { Download, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatINR } from "@/lib/gst/calc";
import { todayIST } from "@/lib/gst/fy";
import { stateName } from "@/lib/gst/states";
import { can } from "@/lib/permissions";
import { billedPercent, isOverdue } from "@/lib/po-status";
import { loadPurchaseOrder } from "@/lib/purchase-orders";
import { requireCompanyPage } from "@/lib/tenant";
import { PoStatusBadge } from "../po-badge";
import { PurchaseOrderActions } from "./po-actions";

export const metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({ params }: PageProps<"/c/[companyId]/purchase-orders/[poId]">) {
  const { companyId, poId } = await params;
  const ctx = await requireCompanyPage(companyId, "purchaseOrders.view");
  const po = await loadPurchaseOrder(ctx.companyId, poId);
  if (!po) notFound();
  const base = `/c/${ctx.companyId}`;
  const open = po.status === "OPEN" || po.status === "PARTIAL";
  const writable = can(ctx, "purchaseOrders.write");
  const anyBilled = po.items.some((i) => i.billedQty > 0);
  const pct = billedPercent(po.items);
  const pdf = `${base}/purchase-orders/${po.id}/pdf`;

  return (
    <>
      <Link href={`${base}/purchase-orders`} className="text-xs text-primary hover:underline">
        ← Purchase orders
      </Link>
      <PageHeader
        title={`Purchase order ${po.number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <PoStatusBadge status={po.status} overdue={isOverdue(po.status, po.expectedDate || null, todayIST())} />
            {po.partyName} · {po.date}
            {po.expectedDate && ` · deliver by ${po.expectedDate}`}
          </span>
        }
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {open && can(ctx, "purchases.write") && <ButtonLink href={`${base}/purchases/new?po=${po.id}`}>Create purchase invoice</ButtonLink>}
            {open && writable && (
              <ButtonLink variant="secondary" href={`${base}/purchase-orders/${po.id}/edit`}>
                Edit
              </ButtonLink>
            )}
            <ButtonLink variant="secondary" href={pdf} target="_blank">
              <FileText size={15} /> PDF
            </ButtonLink>
            <ButtonLink variant="secondary" href={`${pdf}?download=1`}>
              <Download size={15} /> Download
            </ButtonLink>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted">Supplier</div>
              <div className="font-medium">{po.partyName}</div>
              <div className="font-mono text-xs">{po.partyGstin || "Unregistered"}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Place of supply</div>
              <div>{stateName(po.placeOfSupply)}</div>
              {po.paymentTerms && <div className="mt-1 text-xs text-muted">Terms: {po.paymentTerms}</div>}
            </div>
            <div>
              <div className="text-xs text-muted">Deliver to</div>
              <div className="whitespace-pre-wrap">{po.deliveryAddress || "—"}</div>
            </div>
          </Card>

          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th className="text-right">Ordered</Th>
                  <Th className="text-right">Billed</Th>
                  <Th className="text-right">Left</Th>
                  <Th className="text-right">Rate</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {po.items.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      {i.description}
                      <div className="font-mono text-xs text-muted">
                        {i.hsnSac} · GST {i.gstRate}%
                      </div>
                    </Td>
                    <Td className="tabular text-right">
                      {i.qty} {i.unit}
                    </Td>
                    <Td className="tabular text-right">{i.billedQty}</Td>
                    <Td className={`tabular text-right ${i.remaining > 0 && open ? "font-semibold" : "text-muted"}`}>{i.remaining}</Td>
                    <Td className="tabular text-right">{i.rate}</Td>
                    <Td className="tabular text-right">{formatINR(i.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          {po.notes && <p className="whitespace-pre-wrap text-sm text-muted">{po.notes}</p>}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="tabular p-4 text-sm">
            <dl className="grid grid-cols-2 gap-y-1.5">
              <dt className="text-muted">Taxable</dt>
              <dd className="text-right">{formatINR(po.taxable)}</dd>
              {po.isInterstate ? (
                <>
                  <dt className="text-muted">IGST</dt>
                  <dd className="text-right">{formatINR(po.igst)}</dd>
                </>
              ) : (
                <>
                  <dt className="text-muted">CGST</dt>
                  <dd className="text-right">{formatINR(po.cgst)}</dd>
                  <dt className="text-muted">SGST</dt>
                  <dd className="text-right">{formatINR(po.sgst)}</dd>
                </>
              )}
              <dt className="text-muted">Round off</dt>
              <dd className="text-right">{formatINR(po.roundOff)}</dd>
              <dt className="font-semibold">Total</dt>
              <dd className="text-right font-semibold">{formatINR(po.grandTotal)}</dd>
            </dl>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>Billed</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Billed">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Purchase invoices" description={po.invoices.length ? undefined : "None yet"} />
            {po.invoices.length > 0 && (
              <ul className="divide-y divide-border text-sm">
                {po.invoices.map((b) => (
                  <li key={b.id} className={`flex justify-between gap-2 px-5 py-2 ${b.cancelled ? "text-muted line-through" : ""}`}>
                    <Link href={`${base}/purchases/${b.id}`} className="text-primary hover:underline">
                      {b.number}
                    </Link>
                    <span className="text-xs text-muted">{b.date}</span>
                    <span className="tabular">{formatINR(b.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {writable && <PurchaseOrderActions companyId={ctx.companyId} poId={po.id} status={po.status} anyBilled={anyBilled} supplierEmail={po.partyEmail} />}
        </div>
      </div>
    </>
  );
}
