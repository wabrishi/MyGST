"use client";

import { useAction } from "@/components/form-utils";
import { Button } from "@/components/ui";
import { adminRetryFailedEvents } from "./actions";

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
