import "server-only";
import { UserError } from "./user-error";
import { db, type Tx } from "./db";
import { ALL_PERMISSIONS, BUILTIN_ROLE_ID, storedPermissions, type BuiltinRoleKey, type Permission } from "./permissions";

type Client = Tx | typeof db;

const OWNER_ID = BUILTIN_ROLE_ID.OWNER;

/** Built-in roles first, then the company's custom roles (by name). */
export async function companyRoles(companyId: string, client: Client = db) {
  const rows = await client.companyRole.findMany({
    where: { OR: [{ companyId: null }, { companyId }] },
    include: { _count: { select: { members: { where: { membership: { companyId } } } } } },
  });
  const order: Record<string, number> = { OWNER: 0, ACCOUNTANT: 1, STAFF: 2 };
  return rows
    .map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions, builtin: r.companyId === null, members: r._count.members }))
    .sort((a, b) => (order[a.key ?? ""] ?? 9) - (order[b.key ?? ""] ?? 9) || a.name.localeCompare(b.name));
}

/** Checks role ids belong to this company (or are built-in) and returns them de-duplicated. */
export async function validRoleIds(companyId: string, ids: unknown, client: Client = db): Promise<string[]> {
  const list = Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64))] : [];
  if (!list.length) throw new UserError("Choose at least one role");
  const found = await client.companyRole.findMany({ where: { id: { in: list }, OR: [{ companyId: null }, { companyId }] }, select: { id: true } });
  if (found.length !== list.length) throw new UserError("One of the chosen roles doesn't exist");
  return list;
}

export const roleIdOf = (key: BuiltinRoleKey) => BUILTIN_ROLE_ID[key];

/** Creates a membership with the given roles (ids must already be validated). */
export async function addMember(client: Client, data: { userId: string; companyId: string; roleIds: string[] }) {
  return client.membership.create({
    data: { userId: data.userId, companyId: data.companyId, roles: { create: data.roleIds.map((roleId) => ({ roleId })) } },
  });
}

/** Members holding the Owner role. */
export const ownerCount = (companyId: string, client: Client = db) =>
  client.membership.count({ where: { companyId, roles: { some: { roleId: OWNER_ID } } } });

export const holdsOwner = (roleIds: string[]) => roleIds.includes(OWNER_ID);

/**
 * Replaces a member's roles. Refuses to leave the company without an Owner.
 * Returns the previous and new role ids (for the audit log).
 */
export async function setMemberRoles(tx: Tx, companyId: string, membershipId: string, roleIdsInput: unknown) {
  const m = await tx.membership.findFirst({ where: { id: membershipId, companyId }, select: { id: true, roles: { select: { roleId: true } } } });
  if (!m) throw new UserError("Member not found");
  const next = await validRoleIds(companyId, roleIdsInput, tx);
  const prev = m.roles.map((r) => r.roleId);
  if (holdsOwner(prev) && !holdsOwner(next) && (await ownerCount(companyId, tx)) <= 1) {
    throw new UserError("The company needs at least one Owner. Make someone else an Owner first.");
  }
  await tx.membershipRole.deleteMany({ where: { membershipId } });
  await tx.membershipRole.createMany({ data: next.map((roleId) => ({ membershipId, roleId })) });
  return { prev, next };
}

const NAME_RE = /^[\p{L}\p{N} .&()/-]{2,60}$/u;

/** Validates a custom role's name and permissions. */
export function parseRoleInput(input: { name?: unknown; description?: unknown; permissions?: unknown }) {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (!NAME_RE.test(name)) throw new UserError("Role name: 2–60 letters, numbers or spaces");
  if (["owner", "accountant", "staff"].includes(name.toLowerCase())) throw new UserError("That name is used by a built-in role");
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 200) : "";
  const permissions = storedPermissions(input.permissions);
  if (!permissions.length) throw new UserError("Pick at least one permission");
  return { name, description: description || null, permissions: [...new Set(permissions)] as Permission[] };
}

export { ALL_PERMISSIONS };
