import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NONCE_COOKIE, authorizeBackup, parseScope, returnPathOf } from "@/lib/backup/access";
import { signState } from "@/lib/backup/crypto";
import { authorizeUrl, googleConfigured } from "@/lib/backup/google-drive";

/** Starts "Connect Google Drive": /api/backup/google/connect?scope=platform | ?scope=company&companyId=… */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const s = parseScope(url.searchParams.get("scope"), url.searchParams.get("companyId"));
  if (!s) return new Response("Bad request", { status: 400 });
  const back = new URL(returnPathOf(s), url);

  const user = await authorizeBackup(s);
  if (!user) return new Response("Not found", { status: 404 });
  if (!googleConfigured()) {
    back.searchParams.set("backup", "not-configured");
    return NextResponse.redirect(back);
  }

  // CSRF: the signed state must match a nonce stored in an HttpOnly cookie on this browser.
  const nonce = randomBytes(16).toString("base64url");
  (await cookies()).set(NONCE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/api/backup", maxAge: 600 });
  const state = signState({ nonce, userId: user.id, scope: s.scope, companyId: s.scope === "company" ? s.companyId : "" });
  return NextResponse.redirect(authorizeUrl(state, user.email));
}
