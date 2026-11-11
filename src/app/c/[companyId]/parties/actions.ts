"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireCompany } from "@/lib/tenant";
import { partySchema, type PartyInput } from "@/lib/validation";

export async function saveParty(
  companyId: string,
  id: string | null,
  input: PartyInput & { returnTo?: string },
): Promise<ActionResult<{ id: string }>> {
  const res = await run(async () => {
    const ctx = await requireCompany(companyId, "masters.write");
    const data = partySchema.parse(input);
    const row = { ...data, shippingState: data.shippingState || null };

    let partyId: string;
    if (id) {
      const updated = await db.party.updateMany({ where: { id, companyId: ctx.companyId }, data: row });
      if (updated.count !== 1) throw new UserError("Party not found");
      partyId = id;
    } else {
      partyId = (await db.party.create({ data: { ...row, companyId: ctx.companyId } })).id;
    }
    await audit(ctx, id ? "update" : "create", "party", partyId);
    revalidatePath(`/c/${ctx.companyId}/parties`);
    return ok({ id: partyId });
  });
  if (res.ok && input.returnTo !== "none") redirect(`/c/${companyId}/parties`);
  return res;
}

export async function deleteParty(companyId: string, id: string): Promise<ActionResult> {
  const res = await run(async () => {
    const ctx = await requireCompany(companyId, "masters.delete");
    const party = await db.party.findFirst({
      where: { id, companyId: ctx.companyId },
      select: { _count: { select: { documents: true, purchases: true, payments: true } } },
    });
    if (!party) throw new UserError("Party not found");
    const used = party._count.documents + party._count.purchases + party._count.payments;
    if (used > 0) {
      // Keep history intact: deactivate instead of deleting.
      await db.party.update({ where: { id }, data: { active: false } });
      await audit(ctx, "deactivate", "party", id);
    } else {
      await db.party.delete({ where: { id } });
      await audit(ctx, "delete", "party", id);
    }
    revalidatePath(`/c/${ctx.companyId}/parties`);
    return ok(undefined);
  });
  if (res.ok) redirect(`/c/${companyId}/parties`);
  return res;
}
