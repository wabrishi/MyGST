"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ok, run, type ActionResult } from "@/lib/action";
import { cancelPurchase, savePurchase, type PurchaseInput } from "@/lib/purchases";
import { requireCompany } from "@/lib/tenant";

export async function saveBill(companyId: string, id: string | null, input: PurchaseInput): Promise<ActionResult<{ id: string }>> {
  const res = await run(async () => {
    const ctx = await requireCompany(companyId, "purchases.write");
    const billId = await savePurchase(ctx, id, input);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok({ id: billId });
  });
  if (res.ok) redirect(`/c/${companyId}/purchases/${res.data.id}`);
  return res;
}

export async function cancelBill(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "purchases.write");
    await cancelPurchase(ctx, id);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok(undefined, "Bill cancelled");
  });
}
