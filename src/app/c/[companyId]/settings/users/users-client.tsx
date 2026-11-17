"use client";

import { useState } from "react";
import { useAction } from "@/components/form-utils";
import { Alert, Badge, Button, Field, Input, cn } from "@/components/ui";
import { inviteUser, removeMember, revokeInvite, setMemberRoles } from "../actions";

export interface RoleOption {
  id: string;
  name: string;
  description: string | null;
  builtin: boolean;
}

/** Pill-style multi-select of roles. */
export function RolePicker({ roles, value, onChange, disabled, label }: { roles: RoleOption[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {roles.map((r) => {
        const on = value.includes(r.id);
        return (
          <button
            key={r.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={disabled}
            title={r.description ?? undefined}
            onClick={() => onChange(on ? value.filter((v) => v !== r.id) : [...value, r.id])}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
              on ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:border-primary/40 hover:text-foreground",
            )}
          >
            {on ? "✓ " : ""}
            {r.name}
          </button>
        );
      })}
    </div>
  );
}

export function InviteForm({ companyId, roles, defaultRoleId }: { companyId: string; roles: RoleOption[]; defaultRoleId: string }) {
  const { execute, pending, error, fieldErrors } = useAction(inviteUser.bind(null, companyId));
  const [result, setResult] = useState<{ link: string; emailed: boolean } | null>(null);
  const [roleIds, setRoleIds] = useState<string[]>([defaultRoleId]);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setResult(null);
        const email = String(new FormData(form).get("email") ?? "");
        const res = await execute({ email, roleIds });
        if (res?.ok) {
          setResult(res.data);
          form.reset();
          setRoleIds([defaultRoleId]);
        }
      }}
    >
      <Field label="Email" error={fieldErrors.email}>
        <Input name="email" type="email" required />
      </Field>
      <div>
        <div className="mb-1.5 text-sm font-medium">Roles</div>
        <RolePicker roles={roles} value={roleIds} onChange={setRoleIds} label="Invite roles" />
      </div>
      <Button disabled={pending || !roleIds.length} className="self-start">
        {pending ? "Inviting…" : "Send invite"}
      </Button>
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

export function MemberActions({ companyId, membershipId, roles, current, name }: { companyId: string; membershipId: string; roles: RoleOption[]; current: string[]; name: string }) {
  const roleAction = useAction(setMemberRoles.bind(null, companyId, membershipId));
  const removeAction = useAction(removeMember.bind(null, companyId, membershipId));
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const error = roleAction.error || removeAction.error;
  const names = roles.filter((r) => current.includes(r.id));

  return (
    <div className="flex flex-col gap-1.5">
      {editing ? (
        <>
          <RolePicker roles={roles} value={value} onChange={setValue} disabled={roleAction.pending} label={`Roles of ${name}`} />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={roleAction.pending || !value.length}
              onClick={async () => {
                const r = await roleAction.execute(value);
                if (r?.ok) setEditing(false);
              }}
            >
              {roleAction.pending ? "Saving…" : "Save roles"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setValue(current);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1" aria-label={`Roles of ${name}`}>
            {names.map((r) => (
              <Badge key={r.id} color={r.builtin ? "blue" : "gray"}>
                {r.name}
              </Badge>
            ))}
          </div>
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit roles of ${name}`}>
              Edit roles
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              disabled={removeAction.pending}
              onClick={() => confirm("Remove this user from the company?") && removeAction.execute()}
            >
              Remove
            </Button>
          </span>
        </div>
      )}
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
