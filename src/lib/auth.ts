import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { escapeHtml, sendMail } from "./mail";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "mysql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Reset your MyGST password",
        html: `<p>Hi ${escapeHtml(user.name)},</p><p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${escapeHtml(url)}">Reset password</a></p><p>If you didn't request this, ignore this email.</p>`,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: { enabled: true, window: 60, max: 30 },
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
