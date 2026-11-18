import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import { loadPurchase } from "@/lib/purchases";
import { requireCompanyPage } from "@/lib/tenant";
import { loadPurchaseMasters } from "../../masters";
import { PurchaseForm } from "../../purchase-form";

export const metadata = { title: "Edit purchase invoice" };

export default async function EditPurchasePage({ params }: PageProps<"/c/[companyId]/purchases/[billId]/edit">) {
  const { companyId, billId } = await params;
  const ctx = await requireCompanyPage(companyId, "purchases.write");
  const bill = await loadPurchase(ctx.companyId, billId);
  if (!bill) notFound();
  if (bill.cancelled) return <Alert>Cancelled purchase invoices can&apos;t be edited.</Alert>;
  const masters = await loadPurchaseMasters(ctx.companyId);
  if (!masters.suppliers.some((s) => s.id === bill.partyId)) {
    masters.suppliers.unshift({ id: bill.partyId, name: bill.partyName, gstin: bill.partyGstin, stateCode: bill.partyState, creditDays: 0 });
  }
  return (
    <>
      <PageHeader title={`Edit purchase invoice ${bill.billNumber}`} />
      <PurchaseForm
        companyId={ctx.companyId}
        billId={bill.id}
        {...masters}
        initial={{
          partyId: bill.partyId,
          billNumber: bill.billNumber,
          billDate: bill.billDate,
          dueDate: bill.dueDate,
          placeOfSupply: bill.placeOfSupply,
          reverseCharge: bill.reverseCharge,
          itcType: bill.itcType,
          pricesIncludeTax: bill.pricesIncludeTax,
          notes: bill.notes,
          purchaseOrder: bill.purchaseOrder,
          items: bill.items.map(({ sourceId, productId, description, hsnSac, unit, qty, rate, discountPct, gstRate }) => ({
            sourceId,
            sourceLabel: sourceId && bill.purchaseOrder ? `From ${bill.purchaseOrder.number}` : undefined,
            productId, description, hsnSac, unit, qty, rate, discountPct, gstRate,
          })),
        }}
      />
    </>
  );
}
