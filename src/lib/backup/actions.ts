"use server";

import { revalidatePath } from "next/cache";
import { ok, run, UserError, type ActionResult } from "../action";
import { db } from "../db";
import { ForbiddenError } from "../tenant";
import { authorizeBackup, parseScope, returnPathOf, scopeKeyOf, type BackupScopeParam } from "./access";
import { decryptSecret } from "./crypto";
import { revoke } from "./google-drive";
import { runBackup } from "./runner";

async function resolve(scope: string, companyId: string | null) {
  const s = parseScope(scope, companyId);
  if (!s) throw new UserError("Invalid backup scope");
  const user = await authorizeBackup(s);
  if (!user) throw new ForbiddenError();
  const target = await db.backupTarget.findUnique({ where: { scopeKey: scopeKeyOf(s) } });
  return { s, user, target };
}

const audit = async (s: BackupScopeParam, userId: string, action: string) => {
  if (s.scope === "company") await db.auditLog.create({ data: { companyId: s.companyId, userId, action, entity: "backup", entityId: s.companyId } });
};

export async function backupNow(scope: string, companyId: string | null): Promise<ActionResult> {
  return run(async () => {
    const { s, user, target } = await resolve(scope, companyId);
    if (!target) throw new UserError("Connect Google Drive first");
    const r = await runBackup(target.id, "MANUAL");
    await audit(s, user.id, "backup_now");
    revalidatePath(returnPathOf(s));
    if (r.status === "SKIPPED") throw new UserError(r.error ?? "A backup is already running");
    if (r.status === "FAILED") throw new UserError(`Backup failed: ${r.error}`);
    return ok(undefined, `Backup uploaded: ${r.fileName}`);
  });
}

export async function setBackupEnabled(scope: string, companyId: string | null, enabled: boolean): Promise<ActionResult> {
  return run(async () => {
    const { s, user, target } = await resolve(scope, companyId);
    if (!target) throw new UserError("Not connected");
    await db.backupTarget.update({ where: { id: target.id }, data: { enabled } });
    await audit(s, user.id, enabled ? "backup_enable" : "backup_pause");
    revalidatePath(returnPathOf(s));
    return ok(undefined, enabled ? "Automatic backups resumed" : "Automatic backups paused");
  });
}

/** Removes the destination and revokes MyGST's Google access. Files already in Drive are kept. */
export async function disconnectBackup(scope: string, companyId: string | null): Promise<ActionResult> {
  return run(async () => {
    const { s, user, target } = await resolve(scope, companyId);
    if (!target) return ok(undefined);
    await db.backupTarget.delete({ where: { id: target.id } });
    await revoke(decryptSecret(target.refreshTokenEnc)).catch(() => {});
    await audit(s, user.id, "backup_disconnect");
    revalidatePath(returnPathOf(s));
    return ok(undefined, "Google Drive disconnected");
  });
}
