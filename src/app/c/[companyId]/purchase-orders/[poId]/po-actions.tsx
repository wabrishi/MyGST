"use client";

import { useRouter } from "next/navigation";
import { useAction } from "@/components/form-utils";
import { Button } from "@/components/ui";
import type { PoStatus } from "@/lib/po-status";
import { changePOStatus, emailPO } from "../actions";

export function PurchaseOrderActions({ companyId, poId, status, anyBilled, supplierEmail }: { companyId: string; poId: string; status: PoStatus; anyBilled: boolean; supplierEmail: string }) {
  const router = useRouter();
  const email = useAction(emailPO.bind(null, companyId, poId));
  const change = useAction((action: "cancel" | "close" | "reopen") => changePOStatus(companyId, poId, action));
  const act = async (action: "cancel" | "close" | "reopen", question: string) => {
    if (!confirm(question)) return;
    const r = await change.execute(action);
    if (r?.ok) router.refresh();
  };
  const err = email.error || change.error;
  const open = status === "OPEN" || status === "PARTIAL";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {status !== "CANCELLED" && (
          <Button
            variant="secondary"
            disabled={email.pending}
            onClick={() => {
              const to = prompt("Send the purchase order to:", supplierEmail);
              if (to) email.execute(to);
            }}
          >
            {email.pending ? "Sending…" : "Email"}
          </Button>
        )}
        {open && anyBilled && (
          <Button variant="secondary" disabled={change.pending} onClick={() => act("close", "Close this order? The rest of it won't be expected or billed.")}>
            Close order
          </Button>
        )}
        {status === "CLOSED" && (
          <Button variant="secondary" disabled={change.pending} onClick={() => act("reopen", "Reopen this order?")}>
            Reopen
          </Button>
        )}
        {open && !anyBilled && (
          <Button variant="danger" disabled={change.pending} onClick={() => act("cancel", "Cancel this purchase order?")}>
            Cancel order
          </Button>
        )}
      </div>
      {err && <span className="text-xs text-danger">{err}</span>}
      {email.message && <span className="text-xs text-success">{email.message}</span>}
    </div>
  );
}
