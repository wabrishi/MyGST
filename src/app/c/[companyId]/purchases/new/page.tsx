import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/gst/fy";
import { requireCompanyPage } from "@/lib/tenant";
import { loadPurchaseMasters } from "../masters";
import { PurchaseForm } from "../purchase-form";

export const metadata = { title: "New purchase bill" };

export default async function NewPurchasePage({ params }: PageProps<"/c/[companyId]/purchases/new">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "purchases.write");
  const [masters, company] = await Promise.all([
    loadPurchaseMasters(ctx.companyId),
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { stateCode: true, pricesIncludeTax: true } }),
  ]);
  return (
    <>
      <PageHeader title="New purchase bill" />
      {masters.suppliers.length === 0 && (
        <div className="mb-4">
          <Alert kind="warning">Add a supplier under Parties (type Supplier or Both) first.</Alert>
        </div>
      )}
      <PurchaseForm
        companyId={ctx.companyId}
        billId={null}
        {...masters}
        initial={{
          partyId: "",
          billNumber: "",
          billDate: todayIST(),
          dueDate: "",
          placeOfSupply: company.stateCode,
          reverseCharge: false,
          itcType: "ELIGIBLE",
          pricesIncludeTax: company.pricesIncludeTax,
          notes: "",
          items: [],
        }}
      />
    </>
  );
}
