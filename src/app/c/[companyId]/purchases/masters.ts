import "server-only";
import type { LineProduct } from "@/components/line-items";
import { db } from "@/lib/db";

export async function loadPurchaseMasters(companyId: string) {
  const [suppliers, products] = await Promise.all([
    db.party.findMany({
      where: { companyId, active: true, type: { in: ["SUPPLIER", "BOTH"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, gstin: true, stateCode: true, creditDays: true },
    }),
    db.product.findMany({
      where: { companyId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, hsnSac: true, unit: true, purchasePrice: true, gstRate: true },
    }),
  ]);
  return {
    suppliers,
    products: products.map(
      (p): LineProduct => ({ id: p.id, name: p.name, hsnSac: p.hsnSac, unit: p.unit, price: p.purchasePrice.toNumber(), gstRate: p.gstRate.toNumber() }),
    ),
  };
}
