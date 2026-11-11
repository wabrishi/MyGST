import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/enums";
import { getSessionUser, type SessionUser } from "./auth";
import { db } from "./db";
import { can, type Permission } from "./permissions";

export interface CompanyContext {
  user: SessionUser;
  companyId: string;
  role: Role;
  company: { id: string; legalName: string; tradeName: string; stateCode: string; gstin: string };
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
      role: true,
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
  if (perm && !can(m.role, perm)) throw new ForbiddenError();
  const { suspendedAt: _s, ...company } = m.company;
  void _s;
  return { user, companyId: company.id, role: m.role, company };
}

/** Companies the user belongs to (for the switcher / landing redirect). */
export const listUserCompanies = cache(async (userId: string) =>
  db.membership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { role: true, company: { select: { id: true, legalName: true, tradeName: true, suspendedAt: true } } },
  }),
);

/** For pages/layouts: like requireCompany, but a missing permission redirects to the dashboard with a notice. */
export async function requireCompanyPage(companyId: string, perm: Permission): Promise<CompanyContext> {
  const ctx = await requireCompany(companyId);
  if (!can(ctx.role, perm)) redirect(`/c/${ctx.companyId}/dashboard?denied=1`);
  return ctx;
}
