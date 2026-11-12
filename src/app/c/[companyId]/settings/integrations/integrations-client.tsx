"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/form-utils";
import { Alert, Button, Field, Input } from "@/components/ui";
import { CopyButton } from "../api-keys/api-keys-client";
import { regenerateWebhookSecret, retryFailedEvents, revealWebhookSecret, saveLeadsWebhook, sendTestEvent } from "../integration-actions";

export function WebhookForm({ companyId, url, enabled }: { companyId: string; url: string; enabled: boolean }) {
  const router = useRouter();
  const { execute, pending, error, message, fieldErrors } = useAction(saveLeadsWebhook.bind(null, companyId));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if ((await execute({ url: String(f.get("url")), enabled: f.get("enabled") === "on" }))?.ok) router.refresh();
      }}
    >
      <Field
        label="Lead Manager webhook URL"
        error={fieldErrors.url}
        hint="Copy it from Lead Manager → Settings → Integrations → GST Invoicing (https://leads…/api/integrations/gst/…). Leave empty to disconnect."
      >
        <Input name="url" type="url" defaultValue={url} placeholder="https://leads.example.com/api/integrations/gst/…" maxLength={500} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} /> Send events
      </label>
      <div className="flex items-center gap-3">
        <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
    </form>
  );
}

export function WebhookTools({ companyId, deadCount }: { companyId: string; deadCount: number }) {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const reveal = useAction(revealWebhookSecret.bind(null, companyId));
  const rotate = useAction(regenerateWebhookSecret.bind(null, companyId));
  const test = useAction(sendTestEvent.bind(null, companyId));
  const retry = useAction(retryFailedEvents.bind(null, companyId));
  const err = reveal.error || rotate.error || test.error || retry.error;
  const msg = rotate.message || test.message || retry.message;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div>
        <div className="text-[13px] font-medium">Signing secret</div>
        <p className="text-xs text-muted">Paste this into Lead Manager so it can verify that events really come from MyGST.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {secret ? (
          <>
            <code className="break-all rounded bg-surface-2 px-2 py-1 font-mono text-xs" data-testid="webhook-secret">
              {secret}
            </code>
            <CopyButton value={secret} />
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={reveal.pending}
            onClick={async () => {
              const r = await reveal.execute();
              if (r?.ok) setSecret(r.data.secret);
            }}
          >
            Show secret
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={rotate.pending}
          onClick={async () => {
            if (!confirm("Generate a new secret? Lead Manager must be updated or it will reject events.")) return;
            if ((await rotate.execute())?.ok) {
              setSecret(null);
              router.refresh();
            }
          }}
        >
          Regenerate
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={test.pending} onClick={() => test.execute()}>
          {test.pending ? "Sending…" : "Send test event"}
        </Button>
        {deadCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            disabled={retry.pending}
            onClick={async () => {
              if ((await retry.execute())?.ok) router.refresh();
            }}
          >
            Retry {deadCount} failed {deadCount === 1 ? "event" : "events"}
          </Button>
        )}
      </div>
      {err && <Alert>{err}</Alert>}
      {msg && <Alert kind="success">{msg}</Alert>}
    </div>
  );
}
