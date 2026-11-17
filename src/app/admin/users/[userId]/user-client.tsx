"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/form-utils";
import { Alert, Button, Field, Input, cn } from "@/components/ui";
import { adminSendPasswordReset, adminSetPlatformRoles, adminSetTemporaryPassword, adminSetUserDisabled, adminSignOutUser } from "../actions";

function Result({ error, message }: { error?: string | null; message?: string | null }) {
  if (error) return <Alert>{error}</Alert>;
  if (message) return <Alert kind="success">{message}</Alert>;
  return null;
}

export function AccountActions({ userId, disabled, self }: { userId: string; disabled: boolean; self: boolean }) {
  const router = useRouter();
  const toggle = useAction(adminSetUserDisabled.bind(null, userId));
  const signOut = useAction(adminSignOutUser.bind(null, userId));
  const reset = useAction(adminSendPasswordReset.bind(null, userId));
  const last = [toggle, signOut, reset].find((a) => a.error || a.message);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={disabled ? "primary" : "danger"}
          disabled={toggle.pending || self}
          title={self ? "You can't disable your own account" : undefined}
          onClick={async () => {
            if (!disabled && !confirm("Disable this account? They are signed out and can't sign in until enabled again.")) return;
            const r = await toggle.execute(!disabled);
            if (r?.ok) router.refresh();
          }}
        >
          {disabled ? "Enable account" : "Disable account"}
        </Button>
        <Button size="sm" variant="secondary" disabled={signOut.pending} onClick={() => signOut.execute()}>
          Sign out everywhere
        </Button>
        <Button size="sm" variant="secondary" disabled={reset.pending} onClick={() => reset.execute()}>
          Email password reset
        </Button>
      </div>
      <Result error={last?.error} message={last?.message} />
    </div>
  );
}

export function TempPasswordForm({ userId }: { userId: string }) {
  const { execute, pending, error, message, fieldErrors } = useAction(adminSetTemporaryPassword.bind(null, userId));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const r = await execute(String(new FormData(form).get("password") ?? ""));
        if (r?.ok) form.reset();
      }}
    >
      <Field label="Temporary password" hint="At least 8 characters. Share it privately and ask them to change it after signing in." error={fieldErrors.password}>
        <Input name="password" type="text" autoComplete="off" minLength={8} required />
      </Field>
      <Button size="sm" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Set password"}
      </Button>
      <Result error={error} message={message} />
    </form>
  );
}

export function PlatformRolesForm({
  userId,
  roles,
  current,
  canEdit,
}: {
  userId: string;
  roles: Array<{ id: string; name: string; description: string | null }>;
  current: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const { execute, pending, error, message } = useAction(adminSetPlatformRoles.bind(null, userId));
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Admin roles" className="flex flex-col gap-2">
        {roles.map((r) => (
          <label key={r.id} className={cn("flex items-start gap-2 text-sm", !canEdit && "opacity-70")}>
            <input
              type="checkbox"
              className="mt-1"
              disabled={!canEdit || pending}
              checked={value.includes(r.id)}
              onChange={(e) => setValue(e.target.checked ? [...value, r.id] : value.filter((v) => v !== r.id))}
            />
            <span>
              <span className="font-medium">{r.name}</span>
              {r.description && <span className="block text-xs text-muted">{r.description}</span>}
            </span>
          </label>
        ))}
      </div>
      {canEdit && (
        <Button
          size="sm"
          className="self-start"
          disabled={pending}
          onClick={async () => {
            const r = await execute(value);
            if (r?.ok) router.refresh();
          }}
        >
          {pending ? "Saving…" : "Save admin roles"}
        </Button>
      )}
      <Result error={error} message={message} />
    </div>
  );
}
