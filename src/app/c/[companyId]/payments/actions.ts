"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ok, run, type ActionResult } from "@/lib/action";
import { deletePayment, openItems, savePayment, type PaymentInput } from "@/lib/payments";
import { requireCompany } from "@/lib/tenant";

export async function createPayment(companyId: string, input: PaymentInput): Promise<ActionResult<{ id: string }>> {
  const res = await run(async () => {
    const ctx = await requireCompany(companyId, "payments.write");
    const id = await savePayment(ctx, input);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok({ id });
  });
  if (res.ok) redirect(`/c/${companyId}/payments/${res.data.id}`);
  return res;
}

export async function removePayment(companyId: string, id: string): Promise<ActionResult> {
  const res = await run(async () => {
    const ctx = await requireCompany(companyId, "payments.write");
    await deletePayment(ctx, id);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok(undefined);
  });
  if (res.ok) redirect(`/c/${companyId}/payments`);
  return res;
}

export async function loadOpenItems(companyId: string, partyId: string, direction: string) {
  const ctx = await requireCompany(companyId, "payments.write");
  return openItems(ctx.companyId, z.string().parse(partyId), z.enum(["RECEIVED", "PAID"]).parse(direction));
}
