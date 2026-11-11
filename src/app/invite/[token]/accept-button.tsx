"use client";

import { useAction } from "@/components/form-utils";
import { Alert, Button } from "@/components/ui";
import { acceptInvite } from "./actions";

export function AcceptButton({ token }: { token: string }) {
  const { execute, pending, error } = useAction(acceptInvite);
  return (
    <div className="flex flex-col gap-2">
      {error && <Alert>{error}</Alert>}
      <Button className="self-start" disabled={pending} onClick={() => execute(token)}>
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </div>
  );
}
