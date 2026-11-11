import "server-only";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./auth";

/**
 * Platform super-admins (the SaaS operator), configured by email:
 *   SUPER_ADMIN_EMAILS="you@company.com,ops@company.com"
 * Super-admins can create/suspend companies and invite owners. They are NOT members of
 * those companies and cannot read invoices or other books.
 */
const adminEmails = () =>
  new Set(
    (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

export const isSuperAdmin = (user: { email: string } | null | undefined) => !!user && adminEmails().has(user.email.toLowerCase());

/** For /admin pages and actions. Non-admins get a 404 so the panel isn't discoverable. */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (!isSuperAdmin(user)) notFound();
  return user;
}
