"use client";

import { useRouter } from "next/navigation";
import { useAction } from "@/components/form-utils";
import { Button } from "@/components/ui";
import { closeFy, reopenFy } from "../../fy-actions";

export function FyLockButton({ companyId, fy, closed }: { companyId: string; fy: string; closed: boolean }) {
  const router = useRouter();
  const close = useAction(closeFy.bind(null, companyId, fy));
  const reopen = useAction(reopenFy.bind(null, companyId, fy));
  const err = close.error || reopen.error;
  return (
    <div className="flex flex-col items-end">
      {closed ? (
        <Button
          variant="secondary"
          disabled={reopen.pending}
          onClick={async () => {
            if (!confirm(`Re-open FY 20${fy}? Later closed years will also be re-opened.`)) return;
            if ((await reopen.execute())?.ok) router.refresh();
          }}
        >
          Re-open
        </Button>
      ) : (
        <Button
          variant="secondary"
          disabled={close.pending}
          onClick={async () => {
            if (!confirm(`Close FY 20${fy}? All transactions up to 31-03-20${fy.slice(3)} will become read-only.`)) return;
            if ((await close.execute())?.ok) router.refresh();
          }}
        >
          Close year
        </Button>
      )}
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}
