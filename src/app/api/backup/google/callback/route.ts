import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NONCE_COOKIE, authorizeBackup, parseScope, returnPathOf, scopeKeyOf } from "@/lib/backup/access";
import { decryptSecret, encryptSecret, verifyState } from "@/lib/backup/crypto";
import { createFolder, exchangeCode, revoke } from "@/lib/backup/google-drive";
import { folderName } from "@/lib/backup/runner";
import { db } from "@/lib/db";

/** Google redirects here after consent. Stores the (encrypted) refresh token and creates the backup folder. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const nonce = jar.get(NONCE_COOKIE)?.value;
  jar.delete({ name: NONCE_COOKIE, path: "/api/backup" });

  const state = verifyState(url.searchParams.get("state") ?? "");
  const s = state ? parseScope(state.scope, state.companyId || null) : null;
  if (!state || !s || !nonce || state.nonce !== nonce) return new Response("Invalid or expired request. Please try connecting again.", { status: 400 });

  const back = new URL(returnPathOf(s), url);
  const fail = (msg: string) => {
    back.searchParams.set("backup", "error");
    back.searchParams.set("msg", msg.slice(0, 200));
    return NextResponse.redirect(back);
  };

  const user = await authorizeBackup(s);
  if (!user || user.id !== state.userId) return new Response("Not found", { status: 404 });
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") === "access_denied" ? "Google access was not granted" : "Google sign-in failed");
  const code = url.searchParams.get("code");
  if (!code) return fail("Missing authorization code");

  try {
    const { accessToken, refreshToken, email } = await exchangeCode(code);
    const company = s.scope === "company" ? await db.company.findUnique({ where: { id: s.companyId }, select: { legalName: true, tradeName: true } }) : null;
    const folderId = await createFolder(accessToken, folderName(s.scope === "platform" ? "PLATFORM" : "COMPANY", company?.tradeName || company?.legalName));
    const scopeKey = scopeKeyOf(s);

    const previous = await db.backupTarget.findUnique({ where: { scopeKey }, select: { refreshTokenEnc: true, accountEmail: true } });
    const data = {
      provider: "GOOGLE_DRIVE",
      accountEmail: email,
      refreshTokenEnc: encryptSecret(refreshToken),
      folderId,
      enabled: true,
      connectedById: user.id,
      runningSince: null,
    };
    await db.backupTarget.upsert({
      where: { scopeKey },
      create: { scopeKey, scope: s.scope === "platform" ? "PLATFORM" : "COMPANY", companyId: s.scope === "company" ? s.companyId : null, ...data },
      update: data,
    });
    if (previous && previous.accountEmail.toLowerCase() !== email.toLowerCase()) {
      // Switched to a different Google account: best-effort revoke of the old one.
      // (Never for the same account — revoking would also kill the grant we just received.)
      await revoke(decryptSecret(previous.refreshTokenEnc));
    }
    if (s.scope === "company") {
      await db.auditLog.create({ data: { companyId: s.companyId, userId: user.id, action: "connect", entity: "backup", entityId: email } });
    }
    back.searchParams.set("backup", "connected");
    return NextResponse.redirect(back);
  } catch (err) {
    console.error("[backup] Google connect failed:", err);
    return fail(err instanceof Error ? err.message : "Could not connect Google Drive");
  }
}
