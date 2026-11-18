"use client";

import { useAction } from "@/components/form-utils";
import { Button } from "@/components/ui";
import { adminApplyMigrations, adminRetryFailedEvents } from "./actions";

export function ApplyMigrationsButton() {
  const { execute, pending, error, message } = useAction(adminApplyMigrations);
  return (
    <span className="flex flex-col items-start gap-1">
      <Button size="sm" disabled={pending} onClick={() => execute()}>
        {pending ? "Applying…" : "Apply pending migrations"}
      </Button>
      {(error || message) && <span className={error ? "text-xs text-danger" : "text-xs text-muted"}>{error || message}</span>}
    </span>
  );
}

export function RetryEventsButton({ disabled }: { disabled: boolean }) {
  const { execute, pending, error, message } = useAction(adminRetryFailedEvents);
  return (
    <span className="inline-flex items-center gap-2">
      {(error || message) && <span className={error ? "text-xs text-danger" : "text-xs text-muted"}>{error || message}</span>}
      <Button size="sm" variant="secondary" disabled={disabled || pending} onClick={() => execute()}>
        {pending ? "Retrying…" : "Retry failed"}
      </Button>
    </span>
  );
}
