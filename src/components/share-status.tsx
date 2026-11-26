import { Share2 } from "lucide-react";
import type { SharedKind } from "@/generated/prisma/client";
import { shareStatusFor } from "@/lib/sharing";

/** On the sender's own document: whether the other company on MyGSTBook has it, and what they did. */
export async function ShareStatus({ companyId, kind, sourceId, className = "" }: { companyId: string; kind: SharedKind; sourceId: string; className?: string }) {
  const s = await shareStatusFor(companyId, kind, sourceId).catch(() => null);
  if (!s) return null;
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const text =
    s.status === "ACCEPTED"
      ? `${kind === "PAYMENT" ? "confirmed" : "added to their books"} on ${day(s.actedAt)}`
      : s.status === "REJECTED"
        ? `rejected on ${day(s.actedAt)}${s.rejectReason ? `: “${s.rejectReason}”` : ""}`
        : s.status === "WITHDRAWN"
          ? "withdrawn (cancelled here)"
          : s.readAt
            ? `opened on ${day(s.readAt)}, not ${kind === "PAYMENT" ? "confirmed" : "added"} yet`
            : "delivered, not opened yet";
  return (
    <p className={`flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm ${className}`} data-testid="share-status">
      <Share2 size={15} className="shrink-0 text-primary" />
      <span>
        Shared with <b>{s.to}</b> on MyGSTBook · <span className={s.status === "REJECTED" ? "text-danger" : "text-muted"}>{text}</span>
      </span>
    </p>
  );
}
