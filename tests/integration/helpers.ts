import { db } from "@/lib/db";
import { BUILTIN_ROLE_ID, type BuiltinRoleKey } from "@/lib/permissions";
import { memberGrants, ROLES_SELECT, type CompanyContext } from "@/lib/tenant";

/** Adds the user to the company with built-in role(s) and returns the CompanyContext requireCompany would. */
export async function memberContext(
  user: { id: string; name: string; email: string },
  company: { id: string; legalName: string; tradeName?: string; stateCode: string; gstin?: string },
  roles: Array<BuiltinRoleKey | string> = ["OWNER"],
): Promise<CompanyContext> {
  const roleIds = roles.map((r) => (r in BUILTIN_ROLE_ID ? BUILTIN_ROLE_ID[r as BuiltinRoleKey] : r));
  const m = await db.membership.create({
    data: { userId: user.id, companyId: company.id, roles: { create: roleIds.map((roleId) => ({ roleId })) } },
    select: { id: true, ...ROLES_SELECT },
  });
  return {
    user: { id: user.id, name: user.name, email: user.email },
    companyId: company.id,
    membershipId: m.id,
    ...memberGrants(m.roles),
    company: { id: company.id, legalName: company.legalName, tradeName: company.tradeName ?? "", stateCode: company.stateCode, gstin: company.gstin ?? "" },
  };
}
