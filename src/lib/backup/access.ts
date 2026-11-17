import "server-only";
import { adminGrants } from "../admin";
import { getSessionUser } from "../auth";
import { db } from "../db";
import { can } from "../permissions";
import { memberGrants, ROLES_SELECT } from "../tenant";

/** HttpOnly cookie holding the OAuth CSRF nonce. */
export const NONCE_COOKIE = "mygst_backup_oauth";

export type BackupScopeParam = { scope: "platform" } | { scope: "company"; companyId: string };

export const scopeKeyOf = (s: BackupScopeParam) => (s.scope === "platform" ? "platform" : `company:${s.companyId}`);

export const returnPathOf = (s: BackupScopeParam) => (s.scope === "platform" ? "/admin/backups" : `/c/${s.companyId}/settings/backup`);

/**
 * Who may manage a backup destination:
 *  - platform: admins with backups.manage
 *  - company:  members with settings.backups
 * Returns the user, or null when not allowed.
 */
export async function authorizeBackup(s: BackupScopeParam) {
  const user = await getSessionUser();
  if (!user) return null;
  if (s.scope === "platform") return (await adminGrants(user.id, user.email)).permissions.has("backups.manage") ? user : null;
  const m = await db.membership.findUnique({
    where: { userId_companyId: { userId: user.id, companyId: s.companyId } },
    select: { ...ROLES_SELECT, company: { select: { suspendedAt: true } } },
  });
  if (!m || m.company.suspendedAt || !can(memberGrants(m.roles), "settings.backups")) return null;
  return user;
}

export function parseScope(scope: string | null, companyId: string | null): BackupScopeParam | null {
  if (scope === "platform") return { scope: "platform" };
  if (scope === "company" && companyId && /^[a-z0-9]{10,40}$/i.test(companyId)) return { scope: "company", companyId };
  return null;
}
