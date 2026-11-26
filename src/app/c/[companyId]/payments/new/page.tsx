import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst/calc";
import { todayIST } from "@/lib/gst/fy";
import { openPayables, openReceivables } from "@/lib/payments";
import { loadReceived, matchCandidates } from "@/lib/sharing";
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

  // ?received=<id>: a payment a customer on MyGSTBook says they made to us ("Confirm payment" in Received).
  const receivedId = typeof sp.received === "string" ? sp.received : "";
  if (receivedId) {
    const share = await loadReceived(ctx.companyId, receivedId);
    if (share?.kind === "PAYMENT" && share.status !== "ACCEPTED" && share.status !== "WITHDRAWN") {
      const s = share.snapshot;
      const customer = await db.party.findFirst({ where: { companyId: ctx.companyId, gstin: s.from.gstin }, orderBy: { createdAt: "asc" }, select: { id: true } });
      const items = customer ? await openReceivables(db, ctx.companyId, customer.id) : [];
      // Settle the invoices the payer named (their purchase invoice no. = our invoice no.), up to each balance.
      const alloc: Record<string, string> = {};
      let left = toPaise(s.totals.grandTotal);
      for (const a of s.payment?.against ?? []) {
        const inv = items.find((i) => i.number.toLowerCase() === a.number.trim().toLowerCase() && !alloc[i.id]);
        const take = inv ? Math.min(inv.balance, toPaise(a.amount), left) : 0;
        if (!inv || take <= 0) continue;
        alloc[inv.id] = (take / 100).toFixed(2);
        left -= take;
      }
      initial = {
        direction: "RECEIVED",
        partyId: customer?.id ?? "",
        items,
        alloc,
        amount: s.totals.grandTotal.toFixed(2),
        date: s.date,
        mode: s.payment?.mode,
        reference: s.payment?.reference ?? "",
        notes: s.notes,
        received: { id: share.id, from: s.from.name, duplicate: (await matchCandidates(db, ctx.companyId, share)).find((m) => m.sameAmount) ?? null },
      };
    }
  }

  return (
    <div className="max-w-5xl">
      <PageHeader title="Record payment" />
      <PaymentForm companyId={ctx.companyId} parties={parties} today={todayIST()} initial={initial} allowPaid />
    </div>
  );
}
