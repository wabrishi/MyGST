"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { adminAudit, requireAdminAction } from "@/lib/admin";
import { storedAdminPermissions } from "@/lib/admin-permissions";
import { db } from "@/lib/db";

type RoleInput = { name: string; description: string; permissions: string[] };

function parse(input: RoleInput) {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  if (!/^[\p{L}\p{N} .&()/-]{2,60}$/u.test(name)) throw new UserError("Role name: 2–60 letters, numbers or spaces");
  const permissions = [...new Set(storedAdminPermissions(input.permissions))];
  if (!permissions.length) throw new UserError("Pick at least one permission");
  return { name, description: String(input.description ?? "").trim().slice(0, 200) || null, permissions };
}

const duplicate = (e: unknown) => {
  if ((e as { code?: string })?.code === "P2002") throw new UserError("A role with this name already exists");
  throw e;
};

export async function adminCreatePlatformRole(input: RoleInput): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("roles.manage");
    const data = parse(input);
    const role = await db.platformRole.create({ data: { id: `prole_${randomUUID()}`, ...data } }).catch(duplicate);
    await adminAudit(admin, "role.create", "platform_role", role.id, data);
    revalidatePath("/admin/roles");
    return ok(undefined, "Role created");
  });
}

export async function adminUpdatePlatformRole(roleId: string, input: RoleInput): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("roles.manage");
    const role = await db.platformRole.findUnique({ where: { id: String(roleId) } });
    if (!role || role.key) throw new UserError("Built-in roles can't be changed");
    const data = parse(input);
    await db.platformRole.update({ where: { id: role.id }, data }).catch(duplicate);
    await adminAudit(admin, "role.update", "platform_role", role.id, data);
    revalidatePath("/admin", "layout");
    return ok(undefined, "Role saved");
  });
}

export async function adminDeletePlatformRole(roleId: string): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("roles.manage");
    const role = await db.platformRole.findUnique({ where: { id: String(roleId) }, include: { _count: { select: { users: true } } } });
    if (!role || role.key) throw new UserError("Built-in roles can't be deleted");
    if (role._count.users) throw new UserError(`${role._count.users} user(s) still have this role. Remove it from them first.`);
    await db.platformRole.delete({ where: { id: role.id } });
    await adminAudit(admin, "role.delete", "platform_role", role.id, { name: role.name });
    revalidatePath("/admin/roles");
    return ok(undefined, "Role deleted");
  });
}
