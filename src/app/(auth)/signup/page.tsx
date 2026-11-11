"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "../safe-next";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) return setError("Passwords do not match");
    setPending(true);
    setError("");
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")).trim(),
      email: String(form.get("email")).trim(),
      password,
    });
    setPending(false);
    if (error) return setError(error.message || "Could not create account");
    router.replace(safeNext(params.get("next"), "/onboarding"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Create your account</h1>
      {error && <Alert>{error}</Alert>}
      <Field label="Your name">
        <Input name="name" autoComplete="name" required autoFocus maxLength={100} />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" hint="At least 8 characters">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm password">
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Button disabled={pending}>{pending ? "Creating…" : "Create account"}</Button>
      <p className="text-center text-xs text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
