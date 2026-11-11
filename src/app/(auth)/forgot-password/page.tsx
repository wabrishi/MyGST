"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    const { error } = await authClient.requestPasswordReset({
      email: String(new FormData(e.currentTarget).get("email")),
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (error) return setError(error.message || "Could not send reset email");
    setSent(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Reset password</h1>
      {sent ? (
        <Alert kind="success">If an account exists for that email, a reset link has been sent.</Alert>
      ) : (
        <>
          {error && <Alert>{error}</Alert>}
          <Field label="Email">
            <Input name="email" type="email" required autoFocus />
          </Field>
          <Button disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>
        </>
      )}
      <Link href="/login" className="text-center text-xs text-primary hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
