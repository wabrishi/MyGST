"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/form-utils";
import { Alert, Button, Field, Input } from "@/components/ui";
import { createApiKey, revokeApiKey } from "../integration-actions";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : label}
    </Button>
  );
}

export function CreateKeyForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const { execute, pending, error } = useAction(createApiKey.bind(null, companyId));
  const [created, setCreated] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const r = await execute(String(new FormData(form).get("name")));
          if (r?.ok) {
            setCreated(r.data.key);
            form.reset();
            router.refresh();
          }
        }}
      >
        <Field label="Key name" className="min-w-64 flex-1">
          <Input name="name" placeholder="Lead Manager" maxLength={60} required />
        </Field>
        <Button disabled={pending}>{pending ? "Creating…" : "Create API key"}</Button>
      </form>
      {error && <Alert>{error}</Alert>}
      {created && (
        <Alert kind="success">
          <div className="flex flex-col gap-2">
            <span>
              <b>Copy this key now — it won&apos;t be shown again.</b> Store it in Lead Manager → Settings → Integrations.
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-surface px-2 py-1 font-mono text-xs text-foreground" data-testid="new-api-key">
                {created}
              </code>
              <CopyButton value={created} />
            </div>
          </div>
        </Alert>
      )}
    </div>
  );
}

export function RevokeKeyButton({ companyId, id, name }: { companyId: string; id: string; name: string }) {
  const router = useRouter();
  const { execute, pending } = useAction(revokeApiKey.bind(null, companyId, id));
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-danger"
      disabled={pending}
      onClick={async () => {
        if (!confirm(`Revoke “${name}”? Apps using it will stop working immediately.`)) return;
        if ((await execute())?.ok) router.refresh();
      }}
    >
      Revoke
    </Button>
  );
}
