"use client";

import { useRouter } from "next/navigation";
import { useAction } from "@/components/form-utils";
import { Button, ButtonLink, Select } from "@/components/ui";
import type { DocStatus, DocType } from "@/generated/prisma/enums";
import type { DocKind } from "@/lib/doc-kinds";
import { cancelDoc, emailDoc, updateQuotationStatus } from "../actions";

export function DocActions({
  companyId,
  kind,
  docId,
  status,
  type,
  balance,
  partyEmail,
  canEdit,
  canCancel,
  canPay,
}: {
  companyId: string;
  kind: DocKind;
  docId: string;
  status: DocStatus;
  type: DocType;
  balance: number;
  partyEmail: string;
  canEdit: boolean;
  canCancel: boolean;
  canPay: boolean;
}) {
  const router = useRouter();
  const cancel = useAction(cancelDoc.bind(null, companyId, docId));
  const email = useAction(emailDoc.bind(null, companyId, docId));
  const qStatus = useAction(updateQuotationStatus.bind(null, companyId, docId));
  const base = `/c/${companyId}`;
  const live = status !== "CANCELLED";
  const err = cancel.error || email.error || qStatus.error;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink variant="secondary" href={`${base}/${kind}/${docId}/pdf?download=1`} prefetch={false}>
          Download PDF
        </ButtonLink>
        {live && (
          <Button
            variant="secondary"
            disabled={email.pending}
            onClick={() => {
              const to = prompt("Send to email:", partyEmail);
              if (to) email.execute(to);
            }}
          >
            {email.pending ? "Sending…" : "Email"}
          </Button>
        )}
        {canEdit && (
          <ButtonLink variant="secondary" href={`${base}/${kind}/${docId}/edit`}>
            Edit
          </ButtonLink>
        )}
        {type === "INVOICE" && status === "ISSUED" && (
          <>
            {canPay && balance > 0 && <ButtonLink href={`${base}/payments/new?invoice=${docId}`}>Record payment</ButtonLink>}
            <ButtonLink variant="secondary" href={`${base}/credit-notes/new?from=${docId}`}>
              Credit note
            </ButtonLink>
            <ButtonLink variant="secondary" href={`${base}/debit-notes/new?from=${docId}`}>
              Debit note
            </ButtonLink>
          </>
        )}
        {type === "DEBIT_NOTE" && status === "ISSUED" && canPay && balance > 0 && (
          <ButtonLink href={`${base}/payments/new?invoice=${docId}`}>Record payment</ButtonLink>
        )}
        {type === "QUOTATION" && ["OPEN", "ACCEPTED", "EXPIRED"].includes(status) && (
          <>
            <Select
              className="w-32"
              value={status}
              disabled={qStatus.pending}
              onChange={async (e) => {
                await qStatus.execute(e.target.value as "OPEN" | "ACCEPTED" | "EXPIRED");
                router.refresh();
              }}
            >
              <option value="OPEN">Open</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="EXPIRED">Expired</option>
            </Select>
            <ButtonLink href={`${base}/invoices/new?from=${docId}`}>Convert to invoice</ButtonLink>
          </>
        )}
        {canCancel && live && status !== "CONVERTED" && (
          <Button
            variant="ghost"
            className="text-danger"
            disabled={cancel.pending}
            onClick={async () => {
              if (!confirm("Cancel this document? Its number will not be reused. This can't be undone.")) return;
              const r = await cancel.execute();
              if (r?.ok) router.refresh();
            }}
          >
            Cancel
          </Button>
        )}
      </div>
      {err && <span className="text-xs text-danger">{err}</span>}
      {email.message && <span className="text-xs text-success">{email.message}</span>}
    </div>
  );
}
