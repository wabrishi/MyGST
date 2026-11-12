"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (!token) return <Alert>This reset link is invalid or has expired.</Alert>;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword !== String(form.get("confirm"))) return setError("Passwords do not match");
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword, token: token! });
    setPending(false);
    if (error) return setError(error.message || "Could not reset password");
    router.replace("/login?reset=1");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-muted">Use at least 8 characters.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <Field label="New password" hint="At least 8 characters">
        <Input name="password" type="password" required minLength={8} autoFocus />
      </Field>
      <Field label="Confirm password">
        <Input name="confirm" type="password" required minLength={8} />
      </Field>
      <Button size="lg" disabled={pending}>{pending ? "Saving…" : "Update password"}</Button>
    </form>
  );
}

export function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
