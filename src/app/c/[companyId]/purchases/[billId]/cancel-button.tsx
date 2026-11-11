"use client";

import { useRouter } from "next/navigation";
import { useAction } from "@/components/form-utils";
import { Button } from "@/components/ui";
import { cancelBill } from "../actions";

export function CancelBillButton({ companyId, billId }: { companyId: string; billId: string }) {
  const router = useRouter();
  const { execute, pending, error } = useAction(cancelBill.bind(null, companyId, billId));
  return (
    <div className="flex flex-col items-end">
      <Button
        variant="ghost"
        className="text-danger"
        disabled={pending}
        onClick={async () => {
          if (!confirm("Cancel this purchase bill?")) return;
          const r = await execute();
          if (r?.ok) router.refresh();
        }}
      >
        Cancel bill
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
