import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { PLATFORM_ROLE_ID, platformRolePermissions, type AdminPermission } from "./admin-permissions";
import { getSessionUser, type SessionUser } from "./auth";
import { db } from "./db";
import { UserError } from "./user-error";

/**
 * Platform admins (the SaaS operator). Access comes from platform roles (Admin → Roles), plus the
 * break-glass list in SUPER_ADMIN_EMAILS — those emails always have every admin permission, so the
 * operator can't be locked out:
 *   SUPER_ADMIN_EMAILS="you@company.com,ops@company.com"
 * Admins are NOT members of companies and cannot read invoices or other books.
 */
const adminEmails = () =>
  new Set(
    (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

/** In SUPER_ADMIN_EMAILS (always a full super admin). */
export const isBreakGlassAdmin = (user: { email: string } | null | undefined) => !!user && adminEmails().has(user.email.toLowerCase());

export interface AdminGrants {
  permissions: Set<AdminPermission>;
  roles: Array<{ id: string; key: string | null; name: string }>;
  breakGlass: boolean;
}

/** A user's platform permissions (union of their platform roles). Cached per request. */
export const adminGrants = cache(async (userId: string, email: string): Promise<AdminGrants> => {
  const rows = await db.platformRoleAssignment.findMany({ where: { userId }, select: { role: { select: { id: true, key: true, name: true, permissions: true } } } });
  const breakGlass = isBreakGlassAdmin({ email });
  const permissions = new Set<AdminPermission>();
  if (breakGlass) {
    for (const p of platformRolePermissions({ key: "SUPER_ADMIN" })) permissions.add(p);
  }
  for (const { role } of rows) for (const p of platformRolePermissions(role)) permissions.add(p);
  return { permissions, roles: rows.map(({ role: { id, key, name } }) => ({ id, key, name })), breakGlass };
});

/** True if the user can open the admin panel at all. */
export async function hasAdminAccess(user: SessionUser | null | undefined) {
  if (!user) return false;
  return (await adminGrants(user.id, user.email)).permissions.size > 0;
}

export interface AdminContext extends AdminGrants {
  user: SessionUser;
}

export const adminCan = (a: { permissions: ReadonlySet<string> }, perm: AdminPermission) => a.permissions.has(perm);

/**
 * A full super admin: break-glass email or the built-in Super admin platform role. Some actions (such as
 * downloading plugin code) are kept to super admins on purpose, so custom platform roles can't be given them.
 */
export const isSuperAdmin = (a: Pick<AdminGrants, "breakGlass" | "roles">) => a.breakGlass || a.roles.some((r) => r.id === PLATFORM_ROLE_ID.SUPER_ADMIN);

/**
 * For /admin pages and actions. Not signed in → login; no admin permission at all → 404 (the panel
 * isn't discoverable); missing the specific permission → 404 for pages, an error for actions.
 */
export async function requireAdmin(perm?: AdminPermission): Promise<AdminContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  const grants = await adminGrants(user.id, user.email);
  if (!grants.permissions.size) notFound();
  if (perm && !grants.permissions.has(perm)) notFound();
  return { user, ...grants };
}

/** Records an admin action in the platform audit log (never throws). */
export async function adminAudit(admin: { user: SessionUser }, action: string, targetType: string, targetId: string | null, data?: Prisma.InputJsonValue) {
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().slice(0, 64) || null;
  } catch {
    /* outside a request */
  }
  await db.platformAuditLog
    .create({ data: { actorId: admin.user.id, actorEmail: admin.user.email, action, targetType, targetId, data, ip } })
    .catch((e: Error) => console.error("[admin-audit]", e.message));
}

/** For admin server actions: like requireAdmin, but a missing permission is a readable error. */
export async function requireAdminAction(perm: AdminPermission): Promise<AdminContext> {
  const user = await getSessionUser();
  if (!user) throw new UserError("Your session has ended. Sign in again.");
  const grants = await adminGrants(user.id, user.email);
  if (!grants.permissions.has(perm)) throw new UserError("You don't have permission to do that");
  return { user, ...grants };
}
