"use server";

import { revalidatePath } from "next/cache";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db, runTx } from "@/lib/db";
import { formatINR } from "@/lib/gst/calc";
import { ACCEPT_AS, acceptShare, counterpartyFor, loadReceived, matchCandidates } from "@/lib/sharing";
import { requireCompany } from "@/lib/tenant";
import { canActOn } from "./access";

const refresh = (companyId: string) => revalidatePath(`/c/${companyId}`, "layout");

async function actable(companyId: string, shareId: string) {
  const ctx = await requireCompany(companyId);
  const share = await loadReceived(ctx.companyId, shareId);
  if (!share) throw new UserError("Document not found");
  if (!canActOn(ctx, share.kind)) throw new UserError("You don't have permission to do that");
  if (share.status === "WITHDRAWN") throw new UserError("The sender withdrew this document");
  return { ctx, share };
}

/**
 * "Add to purchases" / "Create purchase order" / "Create invoice" / "Confirm payment": makes sure the sender is a party in
 * our books, then returns the prefilled form to open. The share is accepted when that form is saved.
 */
export async function startAccept(companyId: string, shareId: string, target: "invoice" | "quotation" | "default" = "default"): Promise<ActionResult<{ href: string }>> {
  return run(async () => {
    const { ctx, share } = await actable(companyId, shareId);
    if (share.status === "ACCEPTED") throw new UserError("Already added to your books");
    const as = ACCEPT_AS[share.kind];
    if (!as) throw new UserError("This document can't be added to your books yet; mark it as recorded instead");
    const role = as === "sale" || as === "paymentReceived" ? "CUSTOMER" : "SUPPLIER";
    await runTx((tx) => counterpartyFor(tx, ctx.companyId, share.snapshot.from, role));
    const base = `/c/${ctx.companyId}`;
    const href =
      as === "paymentReceived"
        ? `${base}/payments/new?received=${share.id}`
        : as === "purchase"
        ? `${base}/purchases/new?received=${share.id}`
        : as === "purchaseOrder"
          ? `${base}/purchase-orders/new?received=${share.id}`
          : `${base}/${target === "quotation" ? "quotations" : "invoices"}/new?received=${share.id}`;
    return ok({ href });
  });
}

export async function rejectShare(companyId: string, shareId: string, reason: string): Promise<ActionResult> {
  return run(async () => {
    const { ctx, share } = await actable(companyId, shareId);
    if (share.status === "ACCEPTED") throw new UserError("It's already in your books; cancel your own entry instead");
    await db.sharedDocument.update({ where: { id: share.id }, data: { status: "REJECTED", rejectReason: reason.trim().slice(0, 300) || null, actedAt: new Date(), actedBy: ctx.user.id } });
    await audit(ctx, "reject", "shared_document", share.id, { from: share.fromCompanyId, number: share.number });
    refresh(ctx.companyId);
    return ok(undefined, "Rejected. The sender can see this.");
  });
}

/**
 * A payment the sender says they made, which we already recorded by hand: link the two instead of
 * creating a duplicate. The sender sees it as confirmed.
 */
export async function matchPayment(companyId: string, shareId: string, paymentId: string): Promise<ActionResult> {
  return run(async () => {
    const { ctx, share } = await actable(companyId, shareId);
    if (share.kind !== "PAYMENT") throw new UserError("Only payments can be matched");
    const matched = await runTx(async (tx) => {
      // Re-check inside the transaction: still open, and the payment is still an unmatched candidate.
      const fresh = await tx.sharedDocument.findFirst({ where: { id: share.id, toCompanyId: ctx.companyId }, select: { status: true } });
      if (!fresh || fresh.status === "ACCEPTED") throw new UserError("Already in your books");
      if (fresh.status === "WITHDRAWN") throw new UserError("The sender withdrew this payment");
      const candidate = (await matchCandidates(tx, ctx.companyId, share)).find((c) => c.id === paymentId);
      if (!candidate) throw new UserError("That payment can't be matched: it's from another party, outside the dates, or already matched");
      await acceptShare(tx, ctx.companyId, share.id, "PAYMENT", candidate.id, ctx.user.id);
      return candidate;
    });
    await audit(ctx, "match", "shared_document", share.id, { from: share.fromCompanyId, paymentId: matched.id });
    refresh(ctx.companyId);
    return ok(undefined, `Matched with your payment of ${formatINR(matched.amount)} on ${matched.date}. No new entry was added.`);
  });
}

/** Credit/debit notes: acknowledged (they can't be added to the books automatically yet). */
export async function markRecorded(companyId: string, shareId: string): Promise<ActionResult> {
  return run(async () => {
    const { ctx, share } = await actable(companyId, shareId);
    await db.sharedDocument.update({ where: { id: share.id }, data: { status: "ACCEPTED", actedAt: new Date(), actedBy: ctx.user.id, updatedBySender: false } });
    await audit(ctx, "acknowledge", "shared_document", share.id, { from: share.fromCompanyId, number: share.number });
    refresh(ctx.companyId);
    return ok(undefined, "Marked as recorded");
  });
}
