import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { escapeHtml, sendMail } from "./mail";

/**
 * AUTH_MODE=local (default): MyGST's own email/password accounts.
 * AUTH_MODE=hub: the suite Hub is the OIDC provider (Better Auth genericOAuth, provider "hub"); passwords
 * live in the Hub only, and every sign-in refreshes the user's company/role/entitlement (src/lib/hub.ts).
 */
// Read env directly (not via ./hub): hub.ts -> action.ts -> tenant.ts -> auth.ts would be an import cycle.
const HUB = process.env.AUTH_MODE === "hub";
const HUB_URL = (process.env.HUB_URL ?? "").replace(/\/+$/, "");

/** Session cookie prefix — suite apps on one host (localhost shares cookies across ports) must not clash. */
export const COOKIE_PREFIX = "gst";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "mysql" }),
  emailAndPassword: {
    enabled: !HUB,
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
  advanced: { cookiePrefix: COOKIE_PREFIX },
  account: { accountLinking: { enabled: true, trustedProviders: ["hub"] } },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          if (!HUB) return;
          const { syncAfterLogin } = await import("./hub");
          await syncAfterLogin(session.userId).catch((e: Error) => console.error("[hub] sync after sign-in failed:", e.message));
        },
      },
    },
  },
  plugins: [
    ...(HUB
      ? [
          genericOAuth({
            config: [
              {
                providerId: "hub",
                discoveryUrl: `${HUB_URL}/api/auth/.well-known/openid-configuration`,
                clientId: process.env.HUB_CLIENT_ID ?? "",
                clientSecret: process.env.HUB_CLIENT_SECRET ?? "",
                scopes: ["openid", "profile", "email", "suite"],
                pkce: true,
                authentication: "post",
              },
            ],
          }),
        ]
      : []),
    nextCookies(),
  ],
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
