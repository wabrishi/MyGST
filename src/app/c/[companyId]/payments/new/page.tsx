import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/gst/fy";
import { openPayables, openReceivables } from "@/lib/payments";
import { requireCompanyPage } from "@/lib/tenant";
import { PaymentForm } from "../payment-form";

export const metadata = { title: "Record payment" };

export default async function NewPaymentPage({ params, searchParams }: PageProps<"/c/[companyId]/payments/new">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await requireCompanyPage(companyId, "payments.write");
  const parties = await db.party.findMany({
    where: { companyId: ctx.companyId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });

  let initial: Parameters<typeof PaymentForm>[0]["initial"] = { direction: sp.direction === "PAID" ? "PAID" : "RECEIVED", partyId: "" };

  // Deep links: ?invoice=<documentId> or ?bill=<purchaseBillId>
  if (typeof sp.invoice === "string") {
    const doc = await db.document.findFirst({ where: { id: sp.invoice, companyId: ctx.companyId }, select: { partyId: true } });
    if (doc) initial = { direction: "RECEIVED", partyId: doc.partyId, targetId: sp.invoice, items: await openReceivables(db, ctx.companyId, doc.partyId) };
  } else if (typeof sp.bill === "string") {
    const bill = await db.purchaseBill.findFirst({ where: { id: sp.bill, companyId: ctx.companyId }, select: { partyId: true } });
    if (bill) initial = { direction: "PAID", partyId: bill.partyId, targetId: sp.bill, items: await openPayables(db, ctx.companyId, bill.partyId) };
  }

  return (
    <div className="max-w-5xl">
      <PageHeader title="Record payment" />
      <PaymentForm companyId={ctx.companyId} parties={parties} today={todayIST()} initial={initial} allowPaid />
    </div>
  );
}
