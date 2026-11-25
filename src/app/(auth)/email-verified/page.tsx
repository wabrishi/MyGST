import { redirect } from "next/navigation";
import { Alert, ButtonLink } from "@/components/ui";
import { safeNext } from "../safe-next";

export const metadata = { title: "Verify email" };

const MESSAGES: Record<string, string> = {
  TOKEN_EXPIRED: "This verification link has expired.",
  INVALID_TOKEN: "This verification link is invalid or has already been used.",
  USER_NOT_FOUND: "We couldn't find the account for this link.",
  INVALID_USER: "You're signed in as a different user. Sign out and open the link again.",
};

/**
 * Where the emailed verification link lands (the link itself goes to /api/auth/verify-email, which
 * verifies, signs the user in and redirects here). Success continues to `next`; errors are explained.
 */
export default async function Page({ searchParams }: PageProps<"/email-verified">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeNext(one(sp.next), "/onboarding");
  const error = one(sp.error);
  if (!error) redirect(next);

  return (
    <div className="flex flex-col gap-5">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Email not verified</h1>
        <p className="mt-1.5 text-sm text-muted">Sign in with your email and password and we&apos;ll send you a fresh link.</p>
      </div>
      <Alert>{MESSAGES[error] ?? "We couldn't verify your email with this link."}</Alert>
      <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} size="lg">
        Sign in to get a new link
      </ButtonLink>
    </div>
  );
}
