"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/form-utils";
import { RoleForm, type PermissionGroup } from "@/components/role-editor";
import { Button } from "@/components/ui";
import { createRole, deleteRole, updateRole } from "./actions";

export function NewRole({ companyId, groups }: { companyId: string; groups: PermissionGroup[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ New role</Button>;
  return (
    <RoleForm
      groups={groups}
      submitLabel="Create role"
      onCancel={() => setOpen(false)}
      onSubmit={async (d) => {
        const r = await createRole(companyId, d);
        if (r.ok) {
          setOpen(false);
          router.refresh();
        }
        return r;
      }}
    />
  );
}

export function EditRole({
  companyId,
  roleId,
  groups,
  initial,
}: {
  companyId: string;
  roleId: string;
  groups: PermissionGroup[];
  initial: { name: string; description: string; permissions: string[] };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const del = useAction(deleteRole.bind(null, companyId, roleId));
  if (!open) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <span className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)} aria-label={`Edit ${initial.name}`}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            disabled={del.pending}
            onClick={async () => {
              if (!confirm(`Delete the role "${initial.name}"?`)) return;
              const r = await del.execute();
              if (r?.ok) router.refresh();
            }}
          >
            Delete
          </Button>
        </span>
        {del.error && <span className="text-xs text-danger">{del.error}</span>}
      </span>
    );
  }
  return (
    <div className="w-full basis-full pt-3">
      <RoleForm
        groups={groups}
        initial={initial}
        submitLabel="Save role"
        onCancel={() => setOpen(false)}
        onSubmit={async (d) => {
          const r = await updateRole(companyId, roleId, d);
          if (r.ok) {
            setOpen(false);
            router.refresh();
          }
          return r;
        }}
      />
    </div>
  );
}
