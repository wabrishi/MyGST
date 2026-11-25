"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { MOBILE_ERROR, normalizeMobile } from "@/lib/phone";
import { safeNext } from "../safe-next";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const next = safeNext(params.get("next"), "/onboarding");
  // Where the emailed link lands: it shows link errors, otherwise continues to `next`.
  const callbackURL = `/email-verified?next=${encodeURIComponent(next)}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    const phone = normalizeMobile(String(form.get("phone") ?? ""));
    if (!phone) return setError(MOBILE_ERROR);
    if (password !== String(form.get("confirm"))) return setError("Passwords do not match");
    setPending(true);
    setError("");
    const email = String(form.get("email")).trim();
    const { data, error } = await authClient.signUp.email({
      name: String(form.get("name")).trim(),
      email,
      phone,
      password,
      callbackURL,
    });
    setPending(false);
    if (error) return setError(error.message || "Could not create account");
    // No session yet: the account must be verified from the emailed link first.
    if (!data?.token) return setSentTo(email);
    router.replace(next);
    router.refresh();
  }

  if (sentTo) return <CheckEmail email={sentTo} callbackURL={callbackURL} onBack={() => setSentTo("")} />;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1.5 text-sm text-muted">Start billing in minutes. No credit card required.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <Field label="Your name">
        <Input name="name" autoComplete="name" required autoFocus maxLength={100} />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Mobile number" hint="10-digit mobile, e.g. 98765 43210">
        <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} placeholder="+91" />
      </Field>
      <Field label="Password" hint="At least 8 characters">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm password">
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Button size="lg" disabled={pending}>{pending ? "Creating…" : "Create account"}</Button>
      <p className="-mt-2 text-center text-xs text-muted">
        By creating an account you agree to our{" "}
        <Link href="/terms" target="_blank" className="underline hover:text-primary">
          Terms of service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className="underline hover:text-primary">
          Privacy policy
        </Link>
        .
      </p>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

/** Shown after sign-up when the email must be verified first. */
export function CheckEmail({ email, callbackURL, onBack }: { email: string; callbackURL: string; onBack?: () => void }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  async function resend() {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL });
    setState(error ? "error" : "sent");
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-1.5 text-sm text-muted">
          We sent a verification link to <b className="text-foreground">{email}</b>. Click it to finish creating your account. The link is valid for 24 hours.
        </p>
      </div>
      {state === "sent" && <Alert kind="success">A new link is on its way.</Alert>}
      {state === "error" && <Alert>Could not send the email. Please try again in a minute.</Alert>}
      <p className="text-sm text-muted">Can&apos;t find it? Check your spam folder, or send it again.</p>
      <Button type="button" variant="secondary" size="lg" disabled={state === "sending"} onClick={resend}>
        {state === "sending" ? "Sending…" : "Resend email"}
      </Button>
      <p className="text-center text-sm text-muted">
        {onBack ? (
          <button type="button" onClick={onBack} className="font-medium text-primary hover:underline">
            Wrong email? Sign up again
          </button>
        ) : null}
        {onBack ? " · " : null}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
