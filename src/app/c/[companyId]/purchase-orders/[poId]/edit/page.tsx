import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import { loadPurchaseOrder } from "@/lib/purchase-orders";
import { requireCompanyPage } from "@/lib/tenant";
import { loadPurchaseMasters } from "../../../purchases/masters";
import { PurchaseOrderForm } from "../../po-form";

export const metadata = { title: "Edit purchase order" };

export default async function EditPurchaseOrderPage({ params }: PageProps<"/c/[companyId]/purchase-orders/[poId]/edit">) {
  const { companyId, poId } = await params;
  const ctx = await requireCompanyPage(companyId, "purchaseOrders.write");
  const po = await loadPurchaseOrder(ctx.companyId, poId);
  if (!po) notFound();
  if (po.status !== "OPEN" && po.status !== "PARTIAL") return <Alert>Only open or partly billed purchase orders can be edited.</Alert>;
  const masters = await loadPurchaseMasters(ctx.companyId);
  if (!masters.suppliers.some((s) => s.id === po.partyId)) {
    masters.suppliers.unshift({ id: po.partyId, name: po.partyName, gstin: po.partyGstin, stateCode: po.partyState, creditDays: 0 });
  }
  const billed = po.items.some((i) => i.billedQty > 0);
  return (
    <>
      <PageHeader title={`Edit purchase order ${po.number}`} />
      {billed && (
        <div className="mb-4">
          <Alert kind="info">Part of this order has been billed: billed lines can&apos;t be removed or reduced below the billed quantity.</Alert>
        </div>
      )}
      <PurchaseOrderForm
        companyId={ctx.companyId}
        poId={po.id}
        number={po.number}
        supplierLocked={billed}
        {...masters}
        initial={{
          partyId: po.partyId,
          date: po.date,
          expectedDate: po.expectedDate,
          placeOfSupply: po.placeOfSupply,
          pricesIncludeTax: po.pricesIncludeTax,
          deliveryAddress: po.deliveryAddress,
          paymentTerms: po.paymentTerms,
          notes: po.notes,
          items: po.items.map((i) => ({
            sourceId: i.id,
            sourceLabel: i.billedQty > 0 ? `${i.billedQty} ${i.unit} already billed` : undefined,
            productId: i.productId,
            description: i.description,
            hsnSac: i.hsnSac,
            unit: i.unit,
            qty: i.qty,
            rate: i.rate,
            discountPct: i.discountPct,
            gstRate: i.gstRate,
          })),
        }}
      />
    </>
  );
}
