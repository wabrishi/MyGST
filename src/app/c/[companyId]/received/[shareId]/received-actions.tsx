"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/form-utils";
import { Alert, Button, Input } from "@/components/ui";
import { markRecorded, rejectShare, startAccept } from "../actions";

type Accept = { label: string; target: "invoice" | "quotation" | "default" };

/** Accept (open the prefilled form), mark recorded (notes), or reject. */
export function ReceivedActions({ companyId, shareId, accepts, recordOnly, canReject }: { companyId: string; shareId: string; accepts: Accept[]; recordOnly: boolean; canReject: boolean }) {
  const router = useRouter();
  const accept = useAction(startAccept);
  const record = useAction(markRecorded);
  const reject = useAction(rejectShare);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const error = accept.error || record.error || reject.error;

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert>{error}</Alert>}
      {(record.message || reject.message) && <Alert kind="success">{record.message || reject.message}</Alert>}
      <div className="flex flex-wrap gap-2">
        {accepts.map((a, i) => (
          <Button
            key={a.label}
            variant={i === 0 ? "primary" : "secondary"}
            disabled={accept.pending}
            onClick={async () => {
              const r = await accept.execute(companyId, shareId, a.target);
              if (r?.ok) router.push(r.data.href);
            }}
          >
            {a.label}
          </Button>
        ))}
        {recordOnly && (
          <Button
            disabled={record.pending}
            onClick={async () => {
              if ((await record.execute(companyId, shareId))?.ok) router.refresh();
            }}
          >
            Mark as recorded
          </Button>
        )}
        {canReject && !rejecting && (
          <Button variant="ghost" className="text-danger" onClick={() => setRejecting(true)}>
            Reject
          </Button>
        )}
      </div>
      {rejecting && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (the sender sees it)" maxLength={300} className="min-w-56 flex-1" aria-label="Reason for rejecting" />
          <Button
            variant="danger"
            disabled={reject.pending}
            onClick={async () => {
              if ((await reject.execute(companyId, shareId, reason))?.ok) {
                setRejecting(false);
                router.refresh();
              }
            }}
          >
            Reject document
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
