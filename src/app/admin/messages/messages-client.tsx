"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/form-utils";
import { Button } from "@/components/ui";
import { adminDeleteMessage, adminMarkMessage } from "./actions";

export function MarkReadButton({ id, read }: { id: string; read: boolean }) {
  const router = useRouter();
  const { execute, pending } = useAction(adminMarkMessage);
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={async () => {
        if ((await execute(id, !read))?.ok) router.refresh();
      }}
    >
      {read ? "Mark unread" : "Mark read"}
    </Button>
  );
}

export function DeleteMessageButton({ id, backHref }: { id: string; backHref: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const { execute, pending, error } = useAction(adminDeleteMessage);
  if (!confirm) {
    return (
      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirm(true)}>
        Delete
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={async () => {
          if ((await execute(id))?.ok) router.push(backHref);
        }}
      >
        {pending ? "Deleting…" : "Delete message"}
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>
        Cancel
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
