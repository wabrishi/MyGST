"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireCompany } from "@/lib/tenant";
import { productSchema, type ProductInput } from "@/lib/validation";

export async function saveProduct(companyId: string, id: string | null, input: ProductInput): Promise<ActionResult<{ id: string }>> {
  const res = await run(async () => {
    const ctx = await requireCompany(companyId, "masters.write");
    const data = productSchema.parse(input);
    let productId: string;
    if (id) {
      const updated = await db.product.updateMany({ where: { id, companyId: ctx.companyId }, data });
      if (updated.count !== 1) throw new UserError("Product not found");
      productId = id;
    } else {
      productId = (await db.product.create({ data: { ...data, companyId: ctx.companyId } })).id;
    }
    await audit(ctx, id ? "update" : "create", "product", productId);
    revalidatePath(`/c/${ctx.companyId}/products`);
    return ok({ id: productId });
  });
  if (res.ok) redirect(`/c/${companyId}/products`);
  return res;
}

/** Products are only referenced by id on document lines (which snapshot all details), so soft delete is enough. */
export async function deleteProduct(companyId: string, id: string): Promise<ActionResult> {
  const res = await run(async () => {
    const ctx = await requireCompany(companyId, "masters.delete");
    const updated = await db.product.updateMany({ where: { id, companyId: ctx.companyId }, data: { active: false } });
    if (updated.count !== 1) throw new UserError("Product not found");
    await audit(ctx, "deactivate", "product", id);
    revalidatePath(`/c/${ctx.companyId}/products`);
    return ok(undefined);
  });
  if (res.ok) redirect(`/c/${companyId}/products`);
  return res;
}
