import "server-only";
import { db } from "@/lib/db";
import type { DocKind } from "@/lib/doc-kinds";
import type { FormParty, FormProduct } from "./doc-form";

export async function loadFormMasters(companyId: string, kind: DocKind) {
  const [parties, products] = await Promise.all([
    db.party.findMany({
      where: { companyId, active: true, type: { in: ["CUSTOMER", "BOTH"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, gstin: true, stateCode: true, shippingState: true, shippingAddress: true, creditDays: true },
    }),
    db.product.findMany({
      where: { companyId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, hsnSac: true, unit: true, salePrice: true, gstRate: true },
    }),
  ]);
  void kind;
  return {
    parties: parties satisfies FormParty[],
    products: products.map(
      (p): FormProduct => ({ id: p.id, name: p.name, hsnSac: p.hsnSac, unit: p.unit, price: p.salePrice.toNumber(), gstRate: p.gstRate.toNumber() }),
    ),
  };
}
