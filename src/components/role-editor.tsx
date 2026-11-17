"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/action";
import { Alert, Button, Field, Input } from "./ui";

export interface PermissionGroup {
  label: string;
  items: ReadonlyArray<readonly [key: string, label: string]>;
}

export interface RoleDraft {
  name: string;
  description: string;
  permissions: string[];
}

/** Grouped permission checklist. Each group has a "select all" toggle. */
export function PermissionChecklist({ groups, value, onChange, disabled }: { groups: readonly PermissionGroup[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map((g) => {
        const keys = g.items.map(([k]) => k);
        const all = keys.every((k) => value.includes(k));
        return (
          <fieldset key={g.label} className="rounded-lg border border-border p-3" disabled={disabled}>
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">{g.label}</legend>
            <label className="mb-1.5 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={all} onChange={() => onChange(all ? value.filter((v) => !keys.includes(v)) : [...new Set([...value, ...keys])])} />
              All in {g.label.toLowerCase()}
            </label>
            {g.items.map(([k, label]) => (
              <label key={k} className="flex items-start gap-2 py-0.5 text-sm">
                <input type="checkbox" className="mt-1" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((v) => v !== k))} />
                <span>
                  {label}
                  <span className="block font-mono text-[10.5px] text-muted">{k}</span>
                </span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}

/** Create/edit form for a custom role. */
export function RoleForm({
  groups,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  groups: readonly PermissionGroup[];
  initial?: RoleDraft;
  submitLabel: string;
  onSubmit: (draft: RoleDraft) => Promise<ActionResult<unknown> | undefined>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<RoleDraft>(initial ?? { name: "", description: "", permissions: [] });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const r = await onSubmit(draft);
        setPending(false);
        if (r && !r.ok) setError(r.error);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role name">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required maxLength={60} />
        </Field>
        <Field label="Description" hint="Optional">
          <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={200} />
        </Field>
      </div>
      <PermissionChecklist groups={groups} value={draft.permissions} onChange={(permissions) => setDraft({ ...draft, permissions })} disabled={pending} />
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button disabled={pending || !draft.permissions.length}>{pending ? "Saving…" : submitLabel}</Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
