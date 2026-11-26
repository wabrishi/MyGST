"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/form-utils";
import { Alert, Button, Input } from "@/components/ui";
import { formatINR } from "@/lib/gst/calc";
import { markRecorded, matchPayment, rejectShare, startAccept } from "../actions";

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

type Candidate = { id: string; date: string; amount: number; mode: string; reference: string; sameAmount: boolean; difference: number };

/** "Did you already record this?": link the sender's payment to one we entered by hand. */
export function MatchPayments({ companyId, shareId, candidates, base }: { companyId: string; shareId: string; candidates: Candidate[]; base: string }) {
  const router = useRouter();
  const match = useAction(matchPayment);
  const [busy, setBusy] = useState("");
  return (
    <div className="flex flex-col gap-3">
      {match.error && <Alert>{match.error}</Alert>}
      {match.message && <Alert kind="success">{match.message}</Alert>}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {candidates.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <Link href={`${base}/payments/${c.id}`} className="tabular font-semibold hover:text-primary">
                {formatINR(c.amount)}
              </Link>
              <span className="text-muted">
                {" "}· {c.date} · {c.mode}
                {c.reference && ` · Ref ${c.reference}`}
              </span>
              <div className="mt-0.5 text-xs">
                {c.sameAmount ? (
                  <span className="font-medium text-success">Same amount</span>
                ) : (
                  <span className="text-warning">
                    Amounts differ by {formatINR(Math.abs(c.difference))}: check before matching
                  </span>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant={c.sameAmount ? "primary" : "secondary"}
              disabled={match.pending}
              onClick={async () => {
                setBusy(c.id);
                if ((await match.execute(companyId, shareId, c.id))?.ok) router.refresh();
                setBusy("");
              }}
            >
              {busy === c.id ? "Matching…" : "Match"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
