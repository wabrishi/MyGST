import "server-only";
import { isSuperAdmin } from "../admin";
import { getSessionUser } from "../auth";
import { db } from "../db";
import { can } from "../permissions";

/** HttpOnly cookie holding the OAuth CSRF nonce. */
export const NONCE_COOKIE = "mygst_backup_oauth";

export type BackupScopeParam = { scope: "platform" } | { scope: "company"; companyId: string };

export const scopeKeyOf = (s: BackupScopeParam) => (s.scope === "platform" ? "platform" : `company:${s.companyId}`);

export const returnPathOf = (s: BackupScopeParam) => (s.scope === "platform" ? "/admin/backups" : `/c/${s.companyId}/settings/backup`);

/**
 * Who may manage a backup destination:
 *  - platform: super-admins only
 *  - company:  that company's owners (company.settings permission)
 * Returns the user, or null when not allowed.
 */
export async function authorizeBackup(s: BackupScopeParam) {
  const user = await getSessionUser();
  if (!user) return null;
  if (s.scope === "platform") return isSuperAdmin(user) ? user : null;
  const m = await db.membership.findUnique({
    where: { userId_companyId: { userId: user.id, companyId: s.companyId } },
    select: { role: true, company: { select: { suspendedAt: true } } },
  });
  if (!m || m.company.suspendedAt || !can(m.role, "company.settings")) return null;
  return user;
}

export function parseScope(scope: string | null, companyId: string | null): BackupScopeParam | null {
  if (scope === "platform") return { scope: "platform" };
  if (scope === "company" && companyId && /^[a-z0-9]{10,40}$/i.test(companyId)) return { scope: "company", companyId };
  return null;
}
