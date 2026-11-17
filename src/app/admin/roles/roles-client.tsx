"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/form-utils";
import { RoleForm } from "@/components/role-editor";
import { Button } from "@/components/ui";
import { ADMIN_PERMISSION_GROUPS } from "@/lib/admin-permissions";
import { adminCreatePlatformRole, adminDeletePlatformRole, adminUpdatePlatformRole } from "./actions";

export function NewPlatformRole() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ New admin role</Button>;
  return (
    <RoleForm
      groups={ADMIN_PERMISSION_GROUPS}
      submitLabel="Create role"
      onCancel={() => setOpen(false)}
      onSubmit={async (d) => {
        const r = await adminCreatePlatformRole(d);
        if (r.ok) {
          setOpen(false);
          router.refresh();
        }
        return r;
      }}
    />
  );
}

export function EditPlatformRole({ roleId, initial }: { roleId: string; initial: { name: string; description: string; permissions: string[] } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const del = useAction(adminDeletePlatformRole.bind(null, roleId));
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
              if (!confirm(`Delete the admin role "${initial.name}"?`)) return;
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
        groups={ADMIN_PERMISSION_GROUPS}
        initial={initial}
        submitLabel="Save role"
        onCancel={() => setOpen(false)}
        onSubmit={async (d) => {
          const r = await adminUpdatePlatformRole(roleId, d);
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
