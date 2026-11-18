import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/gst/fy";
import { peekNumber } from "@/lib/numbering";
import { companyDeliveryAddress } from "@/lib/purchase-orders";
import { requireCompanyPage } from "@/lib/tenant";
import { loadPurchaseMasters } from "../../purchases/masters";
import { PurchaseOrderForm } from "../po-form";

export const metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage({ params }: PageProps<"/c/[companyId]/purchase-orders/new">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "purchaseOrders.write");
  const today = todayIST();
  const [masters, company, number] = await Promise.all([
    loadPurchaseMasters(ctx.companyId),
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId } }),
    db.$transaction((tx) => peekNumber(tx, ctx.companyId, "PURCHASE_ORDER", today)),
  ]);
  return (
    <>
      <PageHeader title="New purchase order" subtitle="Order goods or services from a supplier. Bill it later with one or more purchase invoices." />
      {masters.suppliers.length === 0 && (
        <div className="mb-4">
          <Alert kind="warning">Add a supplier under Parties (type Supplier or Both) first.</Alert>
        </div>
      )}
      <PurchaseOrderForm
        companyId={ctx.companyId}
        poId={null}
        number={number}
        {...masters}
        initial={{
          partyId: "",
          date: today,
          expectedDate: "",
          placeOfSupply: company.stateCode,
          pricesIncludeTax: company.pricesIncludeTax,
          deliveryAddress: companyDeliveryAddress(company),
          paymentTerms: "",
          notes: "",
          items: [],
        }}
      />
    </>
  );
}
