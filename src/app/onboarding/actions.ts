"use server";

import { redirect } from "next/navigation";
import { ok, run, type ActionResult } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertNoCompany } from "@/lib/one-company";
import { companySchema, type CompanyInput } from "@/lib/validation";

export async function createCompany(input: CompanyInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const result = await run(async () => {
    const data = companySchema.parse(input);
    const company = await db.$transaction(async (tx) => {
      await assertNoCompany(user.id, "You", tx);
      const c = await tx.company.create({ data });
      await tx.membership.create({ data: { userId: user.id, companyId: c.id, role: "OWNER" } });
      await tx.auditLog.create({
        data: { companyId: c.id, userId: user.id, action: "create", entity: "company", entityId: c.id },
      });
      return c;
    });
    return ok({ id: company.id });
  });
  if (result.ok) redirect(`/c/${result.data.id}/setup`);
  return result;
}
