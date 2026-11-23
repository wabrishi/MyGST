import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { sendTemplate } from "./email-render";
import { MOBILE_ERROR, normalizeMobile } from "./phone";

/** Session cookie prefix — suite apps on one host (localhost shares cookies across ports) must not clash. */
export const COOKIE_PREFIX = "gst";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "mysql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendTemplate("password_reset", user.email, { name: user.name, url });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  // Mobile number, asked at sign-up (see databaseHooks.user.create below).
  user: { additionalFields: { phone: { type: "string", required: false, defaultValue: "", input: true } } },
  rateLimit: { enabled: true, window: 60, max: 30 },
  advanced: { cookiePrefix: COOKIE_PREFIX },
  databaseHooks: {
    user: {
      create: {
        // Every new account needs a valid mobile number; it's stored normalised ("+91XXXXXXXXXX").
        before: async (user) => {
          const phone = normalizeMobile((user as { phone?: unknown }).phone);
          if (!phone) throw new APIError("BAD_REQUEST", { message: MOBILE_ERROR, code: "INVALID_PHONE" });
          return { data: { ...user, phone } };
        },
        // Someone invited as a party has now joined.
        after: async (user) => {
          const { markInviteJoined } = await import("./party-invites");
          await markInviteJoined(user.email);
        },
      },
    },
    session: {
      create: {
        // Accounts disabled by a platform admin can't sign in (existing sessions are deleted on disable).
        before: async (session) => {
          const u = await db.user.findUnique({ where: { id: session.userId }, select: { disabledAt: true } });
          if (u?.disabledAt) throw new APIError("FORBIDDEN", { message: "This account has been disabled. Contact support.", code: "ACCOUNT_DISABLED" });
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type SessionUser = { id: string; name: string; email: string };

/** Current user or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
});

/** Current user, or redirect to login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
