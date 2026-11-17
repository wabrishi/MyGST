import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getSessionUser, type SessionUser } from "./auth";
import { db } from "./db";
import { can, primaryRole, resolvePermissions, type BuiltinRoleKey, type Permission } from "./permissions";

export interface MemberRole {
  id: string;
  key: string | null;
  name: string;
}

export interface CompanyContext {
  user: SessionUser;
  companyId: string;
  membershipId: string;
  /** All roles the member holds. */
  roles: MemberRole[];
  /** Union of the roles' permissions. */
  permissions: Set<Permission>;
  /** Highest built-in role held, or null for custom-only members (plugins / external tokens). */
  role: BuiltinRoleKey | null;
  company: { id: string; legalName: string; tradeName: string; stateCode: string; gstin: string };
}

/** Select for a membership's roles; pass the rows to `memberGrants`. */
export const ROLES_SELECT = { roles: { select: { role: { select: { id: true, key: true, name: true, permissions: true } } } } } as const;

export function memberGrants(rows: Array<{ role: { id: string; key: string | null; name: string; permissions: unknown } }>) {
  const all = rows.map((r) => r.role).sort((a, b) => Number(!a.key) - Number(!b.key) || a.name.localeCompare(b.name));
  return {
    roles: all.map(({ id, key, name }) => ({ id, key, name })),
    permissions: resolvePermissions(all),
    role: primaryRole(all),
  };
}

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that") {
    super(message);
  }
}

const loadMembership = cache(async (userId: string, companyId: string) =>
  db.membership.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      id: true,
      ...ROLES_SELECT,
      company: { select: { id: true, legalName: true, tradeName: true, stateCode: true, gstin: true, suspendedAt: true } },
    },
  }),
);

/**
 * THE tenant guard. Every page, server action and route handler under /c/[companyId] calls this first.
 * - not logged in        -> redirect /login
 * - not a member         -> 404 (don't reveal that the company exists)
 * - company suspended    -> redirect /companies?suspended=1
 * - lacks `perm`         -> ForbiddenError
 * All subsequent queries must use the returned `companyId`, never one from client input.
 */
export async function requireCompany(companyId: string, perm?: Permission): Promise<CompanyContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (typeof companyId !== "string" || !companyId) notFound();
  const m = await loadMembership(user.id, companyId);
  if (!m) notFound();
  if (m.company.suspendedAt) redirect("/companies?suspended=1");
  const grants = memberGrants(m.roles);
  if (perm && !can(grants, perm)) throw new ForbiddenError();
  const { suspendedAt: _s, ...company } = m.company;
  void _s;
  return { user, companyId: company.id, membershipId: m.id, ...grants, company };
}

/** Companies the user belongs to (for the switcher / landing redirect). */
export const listUserCompanies = cache(async (userId: string) =>
  db.membership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { ...ROLES_SELECT, company: { select: { id: true, legalName: true, tradeName: true, suspendedAt: true } } },
  }),
);

/** For pages/layouts: like requireCompany, but a missing permission redirects to the dashboard with a notice. */
export async function requireCompanyPage(companyId: string, perm: Permission): Promise<CompanyContext> {
  const ctx = await requireCompany(companyId);
  if (!can(ctx, perm)) redirect(`/c/${ctx.companyId}/dashboard?denied=1`);
  return ctx;
}

/** For pages/layouts that open with any one of several permissions (e.g. the settings area). */
export async function requireCompanyPageAny(companyId: string, perms: readonly Permission[]): Promise<CompanyContext> {
  const ctx = await requireCompany(companyId);
  if (!perms.some((p) => can(ctx, p))) redirect(`/c/${ctx.companyId}/dashboard?denied=1`);
  return ctx;
}
