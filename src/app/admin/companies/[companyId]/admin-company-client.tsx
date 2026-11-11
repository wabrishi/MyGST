"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formToObject, useAction } from "@/components/form-utils";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { adminInvite, adminSetSuspended } from "../../actions";

export function AdminInviteForm({ companyId }: { companyId: string }) {
  const { execute, pending, error, fieldErrors } = useAction(adminInvite.bind(null, companyId));
  const [result, setResult] = useState<{ link: string; emailed: boolean } | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setResult(null);
        const r = await execute(formToObject(form) as { email: string; role: string });
        if (r?.ok) {
          setResult(r.data);
          form.reset();
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Email" error={fieldErrors.email} className="min-w-64 flex-1">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Role">
          <Select name="role" defaultValue="OWNER">
            <option value="OWNER">Owner</option>
            <option value="ACCOUNTANT">Accountant</option>
            <option value="STAFF">Staff</option>
          </Select>
        </Field>
        <Button disabled={pending}>{pending ? "Inviting…" : "Send invite"}</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {result && (
        <Alert kind="success">
          {result.emailed ? "Invitation emailed. " : "Email isn't configured — share this link: "}
          <code className="break-all text-xs">{result.link}</code>
        </Alert>
      )}
    </form>
  );
}

export function SuspendButton({ companyId, suspended }: { companyId: string; suspended: boolean }) {
  const router = useRouter();
  const { execute, pending, error } = useAction(adminSetSuspended.bind(null, companyId, !suspended));
  return (
    <div className="flex flex-col items-end">
      <Button
        variant={suspended ? "secondary" : "danger"}
        disabled={pending}
        onClick={async () => {
          const msg = suspended
            ? "Reactivate this company? Its users regain access."
            : "Suspend this company? Its users won't be able to open it until reactivated. No data is deleted.";
          if (!confirm(msg)) return;
          if ((await execute())?.ok) router.refresh();
        }}
      >
        {suspended ? "Reactivate" : "Suspend company"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
