import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/gst/fy";
import { peekNumber } from "@/lib/numbering";
import { companyDeliveryAddress } from "@/lib/purchase-orders";
import { loadReceived, prefillLines } from "@/lib/sharing";
import { requireCompanyPage } from "@/lib/tenant";
import { loadPurchaseMasters } from "../../purchases/masters";
import { PurchaseOrderForm } from "../po-form";

export const metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage({ params, searchParams }: PageProps<"/c/[companyId]/purchase-orders/new">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await requireCompanyPage(companyId, "purchaseOrders.write");
  const today = todayIST();
  const [masters, company, number] = await Promise.all([
    loadPurchaseMasters(ctx.companyId),
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId } }),
    db.$transaction((tx) => peekNumber(tx, ctx.companyId, "PURCHASE_ORDER", today)),
  ]);
  // ?received=<id>: order from a quotation a supplier on MyGSTBook sent us.
  const receivedId = typeof sp.received === "string" ? sp.received : "";
  const share = receivedId ? await loadReceived(ctx.companyId, receivedId) : null;
  const fromQuote = share?.kind === "QUOTATION" && share.status !== "ACCEPTED" && share.status !== "WITHDRAWN" ? share : null;
  const supplierId = fromQuote
    ? ((await db.party.findFirst({ where: { companyId: ctx.companyId, gstin: fromQuote.snapshot.from.gstin }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id ?? "")
    : "";

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
          items: fromQuote ? prefillLines(fromQuote.snapshot) : [],
          ...(fromQuote && {
            partyId: supplierId,
            pricesIncludeTax: fromQuote.snapshot.pricesIncludeTax,
            notes: `As per your quotation ${fromQuote.number}`,
            received: { id: fromQuote.id, from: fromQuote.snapshot.from.name, number: fromQuote.number },
          }),
        }}
      />
    </>
  );
}
