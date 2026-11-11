"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "../safe-next";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) return setError(error.message || "Invalid email or password");
    router.replace(safeNext(params.get("next")));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Sign in</h1>
      {params.get("reset") && <Alert kind="success">Password updated. Please sign in.</Alert>}
      {error && <Alert>{error}</Alert>}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
      <div className="flex justify-between text-xs">
        <Link href="/forgot-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
        <Link href={`/signup${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`} className="text-primary hover:underline">
          Create an account
        </Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
