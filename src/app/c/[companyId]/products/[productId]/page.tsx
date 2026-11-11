import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCompany } from "@/lib/tenant";
import { ProductForm } from "../product-form";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: PageProps<"/c/[companyId]/products/[productId]">) {
  const { companyId, productId } = await params;
  const ctx = await requireCompany(companyId);
  const p = await db.product.findFirst({ where: { id: productId, companyId: ctx.companyId } });
  if (!p) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title={p.name} />
      <Card className="p-5">
        <ProductForm
          companyId={ctx.companyId}
          id={p.id}
          canDelete={can(ctx.role, "masters.delete")}
          initial={{
            name: p.name,
            hsnSac: p.hsnSac,
            isService: p.isService,
            unit: p.unit,
            salePrice: p.salePrice.toNumber(),
            purchasePrice: p.purchasePrice.toNumber(),
            gstRate: p.gstRate.toNumber(),
          }}
        />
      </Card>
    </div>
  );
}
