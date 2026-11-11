"use client";

import { useAction } from "@/components/form-utils";
import { Button } from "@/components/ui";
import { removePayment } from "../actions";

export function DeletePaymentButton({ companyId, paymentId }: { companyId: string; paymentId: string }) {
  const { execute, pending, error } = useAction(removePayment.bind(null, companyId, paymentId));
  return (
    <div className="flex flex-col items-end">
      <Button variant="ghost" className="text-danger" disabled={pending} onClick={() => confirm("Delete this payment? Linked invoices will become unpaid again.") && execute()}>
        Delete payment
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
