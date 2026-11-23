import Link from "next/link";
import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/gst/fy";
import { can } from "@/lib/permissions";
import { loadPurchaseOrder } from "@/lib/purchase-orders";
import { loadReceived, prefillLines } from "@/lib/sharing";
import { requireCompanyPage } from "@/lib/tenant";
import { loadPurchaseMasters } from "../masters";
import { PurchaseForm, type PurchaseFormInitial } from "../purchase-form";

export const metadata = { title: "New purchase invoice" };

export default async function NewPurchasePage({ params, searchParams }: PageProps<"/c/[companyId]/purchases/new">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await requireCompanyPage(companyId, "purchases.write");
  const [masters, company] = await Promise.all([
    loadPurchaseMasters(ctx.companyId),
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { stateCode: true, pricesIncludeTax: true } }),
  ]);

  let initial: PurchaseFormInitial = {
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
  };
  let poProblem = "";

  // ?po=<id>: bill a purchase order (what's left on each line).
  const poId = typeof sp.po === "string" ? sp.po : "";
  if (poId && can(ctx, "purchaseOrders.view")) {
    const po = await loadPurchaseOrder(ctx.companyId, poId);
    if (!po) poProblem = "That purchase order wasn't found.";
    else if (po.status !== "OPEN" && po.status !== "PARTIAL") poProblem = `Purchase order ${po.number} is ${po.status.toLowerCase()} and can't be billed.`;
    else {
      const open = po.items.filter((i) => i.remaining > 0);
      initial = {
        ...initial,
        partyId: po.partyId,
        placeOfSupply: po.placeOfSupply,
        pricesIncludeTax: po.pricesIncludeTax,
        purchaseOrder: { id: po.id, number: po.number },
        items: open.map((i) => ({
          sourceId: i.id,
          sourceLabel: `${po.number} · ${i.remaining} of ${i.qty} ${i.unit} left`,
          productId: i.productId,
          description: i.description,
          hsnSac: i.hsnSac,
          unit: i.unit,
          qty: i.remaining,
          rate: i.rate,
          discountPct: i.discountPct,
          gstRate: i.gstRate,
        })),
      };
    }
  }

  // ?received=<id>: an invoice a supplier on MyGSTBook sent us (supplier created by "Add to purchases").
  const receivedId = typeof sp.received === "string" ? sp.received : "";
  if (receivedId) {
    const share = await loadReceived(ctx.companyId, receivedId);
    if (share?.kind === "INVOICE" && share.status !== "ACCEPTED" && share.status !== "WITHDRAWN") {
      const s = share.snapshot;
      const supplier = await db.party.findFirst({ where: { companyId: ctx.companyId, gstin: s.from.gstin }, orderBy: { createdAt: "asc" }, select: { id: true } });
      initial = {
        ...initial,
        partyId: supplier?.id ?? "",
        billNumber: s.number.slice(0, 30),
        billDate: s.date,
        dueDate: s.dueDate,
        placeOfSupply: s.placeOfSupply,
        pricesIncludeTax: s.pricesIncludeTax,
        items: prefillLines(s),
        received: { id: share.id, from: s.from.name, number: s.number },
      };
    }
  }

  return (
    <>
      <PageHeader title="New purchase invoice" subtitle="Record a supplier's invoice for input tax credit and payables." />
      {poProblem && (
        <div className="mb-4">
          <Alert kind="warning">
            {poProblem}{" "}
            <Link href={`/c/${ctx.companyId}/purchase-orders`} className="underline">
              Purchase orders
            </Link>
          </Alert>
        </div>
      )}
      {masters.suppliers.length === 0 && (
        <div className="mb-4">
          <Alert kind="warning">Add a supplier under Parties (type Supplier or Both) first.</Alert>
        </div>
      )}
      <PurchaseForm companyId={ctx.companyId} billId={null} {...masters} initial={initial} />
    </>
  );
}
