"use server";

import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { revalidatePath } from "next/cache";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { adminAudit, requireAdminAction } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailEnabled } from "@/lib/mail";

const refresh = (userId: string) => {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
};

async function loadUser(userId: string) {
  const u = await db.user.findUnique({ where: { id: String(userId) }, select: { id: true, email: true, name: true, disabledAt: true } });
  if (!u) throw new UserError("User not found");
  return u;
}

/** Disables (signs out and blocks sign-in) or re-enables an account. */
export async function adminSetUserDisabled(userId: string, disabled: boolean): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("users.manage");
    const u = await loadUser(userId);
    if (u.id === admin.user.id) throw new UserError("You can't disable your own account");
    await db.$transaction([
      db.user.update({ where: { id: u.id }, data: { disabledAt: disabled ? new Date() : null } }),
      ...(disabled ? [db.session.deleteMany({ where: { userId: u.id } })] : []),
    ]);
    await adminAudit(admin, disabled ? "user.disable" : "user.enable", "user", u.id, { email: u.email });
    refresh(u.id);
    return ok(undefined, disabled ? "Account disabled and signed out" : "Account enabled");
  });
}

/** Ends every session of the user (they must sign in again). */
export async function adminSignOutUser(userId: string): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("users.manage");
    const u = await loadUser(userId);
    const r = await db.session.deleteMany({ where: { userId: u.id } });
    await adminAudit(admin, "user.sign_out", "user", u.id, { email: u.email, sessions: r.count });
    refresh(u.id);
    return ok(undefined, `${r.count} session${r.count === 1 ? "" : "s"} ended`);
  });
}

/** Emails the user a password-reset link (needs SMTP). */
export async function adminSendPasswordReset(userId: string): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("users.manage");
    const u = await loadUser(userId);
    if (!mailEnabled()) throw new UserError("Email isn't configured (SMTP_HOST). Set a temporary password instead.");
    await auth.api.requestPasswordReset({ body: { email: u.email, redirectTo: "/reset-password" } });
    await adminAudit(admin, "user.password_reset_email", "user", u.id, { email: u.email });
    return ok(undefined, `Reset link sent to ${u.email}`);
  });
}

/** Sets a temporary password and signs the user out everywhere. Tell them to change it after signing in. */
export async function adminSetTemporaryPassword(userId: string, password: string): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("users.manage");
    const u = await loadUser(userId);
    const pw = String(password ?? "");
    if (pw.length < 8 || pw.length > 128) throw new UserError("Use 8–128 characters", "password");
    const hash = await hashPassword(pw);
    await db.$transaction(async (tx) => {
      const acc = await tx.account.findFirst({ where: { userId: u.id, providerId: "credential" } });
      if (acc) await tx.account.update({ where: { id: acc.id }, data: { password: hash } });
      else await tx.account.create({ data: { id: randomUUID(), accountId: u.id, providerId: "credential", userId: u.id, password: hash } });
      await tx.session.deleteMany({ where: { userId: u.id } });
    });
    await adminAudit(admin, "user.set_password", "user", u.id, { email: u.email });
    refresh(u.id);
    return ok(undefined, "Temporary password set. The user was signed out.");
  });
}

/** Replaces the user's platform (admin) roles. */
export async function adminSetPlatformRoles(userId: string, roleIds: string[]): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("roles.manage");
    const u = await loadUser(userId);
    const ids = [...new Set((Array.isArray(roleIds) ? roleIds : []).map(String))];
    const found = await db.platformRole.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    if (found.length !== ids.length) throw new UserError("One of the chosen roles doesn't exist");
    await db.$transaction([
      db.platformRoleAssignment.deleteMany({ where: { userId: u.id } }),
      db.platformRoleAssignment.createMany({ data: ids.map((roleId) => ({ userId: u.id, roleId })) }),
    ]);
    await adminAudit(admin, "user.platform_roles", "user", u.id, { email: u.email, roles: found.map((r) => r.name) });
    refresh(u.id);
    revalidatePath("/admin/roles");
    return ok(undefined, ids.length ? "Admin roles updated" : "Admin access removed");
  });
}
