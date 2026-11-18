"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { holdsGrantable } from "@/lib/permissions";
import { activeEntries } from "@/lib/plugins/runner";
import { parseRoleInput } from "@/lib/roles";
import { requireCompany, type CompanyContext } from "@/lib/tenant";

type RoleInput = { name: string; description: string; permissions: string[] };

/** No privilege escalation: a role can only contain permissions its creator holds. */
async function assertWithinOwn(ctx: CompanyContext, permissions: string[]) {
  const capabilities = new Map((await activeEntries(ctx.companyId).catch(() => [])).map((e) => [e.plugin.id, e.manifest.capabilities]));
  const missing = permissions.filter((p) => !holdsGrantable(ctx, p, capabilities));
  if (missing.length) throw new UserError(`You can't give permissions you don't have: ${missing.join(", ")}`);
}

const refresh = (companyId: string) => revalidatePath(`/c/${companyId}`, "layout");

const duplicate = (e: unknown) => (e as { code?: string })?.code === "P2002";

export async function createRole(companyId: string, input: RoleInput): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.roles");
    const data = parseRoleInput(input);
    await assertWithinOwn(ctx, data.permissions);
    const role = await db.companyRole
      .create({ data: { id: `crole_${randomUUID()}`, companyId: ctx.companyId, name: data.name, description: data.description, permissions: data.permissions } })
      .catch((e) => {
        throw duplicate(e) ? new UserError("A role with this name already exists") : e;
      });
    await audit(ctx, "create", "role", role.id, { name: data.name, permissions: data.permissions });
    refresh(ctx.companyId);
    return ok({ id: role.id }, "Role created");
  });
}

export async function updateRole(companyId: string, roleId: string, input: RoleInput): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.roles");
    const role = await db.companyRole.findFirst({ where: { id: roleId, companyId: ctx.companyId } });
    if (!role) throw new UserError("Built-in roles can't be changed");
    const data = parseRoleInput(input);
    await assertWithinOwn(ctx, data.permissions);
    await db.companyRole.update({ where: { id: role.id }, data: { name: data.name, description: data.description, permissions: data.permissions } }).catch((e) => {
      throw duplicate(e) ? new UserError("A role with this name already exists") : e;
    });
    await audit(ctx, "update", "role", role.id, { name: data.name, permissions: data.permissions });
    refresh(ctx.companyId);
    return ok(undefined, "Role saved");
  });
}

export async function deleteRole(companyId: string, roleId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.roles");
    const role = await db.companyRole.findFirst({ where: { id: roleId, companyId: ctx.companyId }, include: { _count: { select: { members: true } } } });
    if (!role) throw new UserError("Built-in roles can't be deleted");
    if (role._count.members > 0) throw new UserError(`${role._count.members} member(s) still have this role. Change their roles first.`);
    const pendingInvites = await db.invitation.count({ where: { companyId: ctx.companyId, acceptedAt: null, roleIds: { array_contains: [role.id] } } });
    if (pendingInvites) throw new UserError(`${pendingInvites} pending invitation(s) use this role. Revoke them first.`);
    await db.companyRole.delete({ where: { id: role.id } });
    await audit(ctx, "delete", "role", role.id, { name: role.name });
    refresh(ctx.companyId);
    return ok(undefined, "Role deleted");
  });
}
