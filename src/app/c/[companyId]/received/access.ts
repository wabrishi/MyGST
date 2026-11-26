import type { SharedKind, SharedStatus } from "@/generated/prisma/client";
import { can, type Grants } from "@/lib/permissions";

/** Which received kinds a member may see: purchase-side documents, or orders customers sent us. */
export function visibleKinds(ctx: Grants): SharedKind[] {
  const kinds: SharedKind[] = [];
  if (can(ctx, "purchases.view")) kinds.push("INVOICE", "CREDIT_NOTE", "DEBIT_NOTE");
  if (can(ctx, "purchaseOrders.view")) kinds.push("QUOTATION");
  if (can(ctx, "docs.create")) kinds.push("PURCHASE_ORDER");
  if (can(ctx, "payments.view")) kinds.push("PAYMENT");
  return kinds;
}

/** Permission to act on (accept / reject) a received kind. */
export function canActOn(ctx: Grants, kind: SharedKind) {
  if (kind === "INVOICE" || kind === "CREDIT_NOTE" || kind === "DEBIT_NOTE") return can(ctx, "purchases.write");
  if (kind === "QUOTATION") return can(ctx, "purchaseOrders.write");
  if (kind === "PAYMENT") return can(ctx, "payments.write");
  return can(ctx, "docs.create");
}

/** How each status reads in the inbox. */
export const STATUS_BADGE: Record<SharedStatus, { label: string; color: "blue" | "green" | "red" | "gray" }> = {
  NEW: { label: "New", color: "blue" },
  ACCEPTED: { label: "In your books", color: "green" },
  REJECTED: { label: "Rejected", color: "red" },
  WITHDRAWN: { label: "Withdrawn by sender", color: "gray" },
};

