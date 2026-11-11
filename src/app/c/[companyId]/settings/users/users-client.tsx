"use client";

import { useState } from "react";
import { formToObject, useAction } from "@/components/form-utils";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import type { Role } from "@/generated/prisma/enums";
import { changeRole, inviteUser, removeMember, revokeInvite } from "../actions";

export function InviteForm({ companyId }: { companyId: string }) {
  const { execute, pending, error, fieldErrors } = useAction(inviteUser.bind(null, companyId));
  const [result, setResult] = useState<{ link: string; emailed: boolean } | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setResult(null);
        const res = await execute(formToObject(form) as { email: string; role: string });
        if (res?.ok) {
          setResult(res.data);
          form.reset();
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Email" error={fieldErrors.email} className="min-w-64 flex-1">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Role">
          <Select name="role" defaultValue="STAFF">
            <option value="STAFF">Staff</option>
            <option value="ACCOUNTANT">Accountant</option>
            <option value="OWNER">Owner</option>
          </Select>
        </Field>
        <Button disabled={pending}>{pending ? "Inviting…" : "Send invite"}</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {result && (
        <Alert kind="success">
          {result.emailed ? "Invitation emailed. " : "Email is not configured — share this link with them: "}
          <code className="break-all text-xs">{result.link}</code>
        </Alert>
      )}
    </form>
  );
}

export function MemberActions({ companyId, membershipId, role }: { companyId: string; membershipId: string; role: Role }) {
  const roleAction = useAction(changeRole.bind(null, companyId, membershipId));
  const removeAction = useAction(removeMember.bind(null, companyId, membershipId));
  const error = roleAction.error || removeAction.error;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <Select
          className="w-36"
          defaultValue={role}
          disabled={roleAction.pending}
          onChange={(e) => roleAction.execute(e.target.value)}
        >
          <option value="OWNER">Owner</option>
          <option value="ACCOUNTANT">Accountant</option>
          <option value="STAFF">Staff</option>
        </Select>
        <Button
          variant="ghost"
          className="text-danger"
          disabled={removeAction.pending}
          onClick={() => confirm("Remove this user from the company?") && removeAction.execute()}
        >
          Remove
        </Button>
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function RevokeInviteButton({ companyId, inviteId }: { companyId: string; inviteId: string }) {
  const { execute, pending } = useAction(revokeInvite.bind(null, companyId, inviteId));
  return (
    <Button variant="ghost" disabled={pending} onClick={() => execute()}>
      Revoke
    </Button>
  );
}
