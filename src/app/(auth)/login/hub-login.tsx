"use client";

import { useEffect, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { signInWithHub } from "@/lib/auth-client";

/** AUTH_MODE=hub: sign-in happens at the suite Hub. Starts automatically; the button is a fallback. */
export function HubLogin({ next, error: initialError }: { next: string; error: string }) {
  const [error, setError] = useState(initialError ? "Sign-in didn't complete. Please try again." : "");
  const [pending, setPending] = useState(!initialError);
  const go = async () => {
    setPending(true);
    setError("");
    try {
      await signInWithHub(next);
    } catch (e) {
      setPending(false);
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (initialError) return;
    signInWithHub(next).catch((e: Error) => {
      setPending(false);
      setError(e.message);
    });
  }, [initialError, next]);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1.5 text-sm text-muted">MyGST uses your suite account.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <Button size="lg" disabled={pending} onClick={go}>
        {pending ? "Redirecting…" : "Continue with your account"}
      </Button>
    </div>
  );
}
