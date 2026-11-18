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
  // Values plugins keep on the product (e.g. stock on hand), keyed "<plugin>.<field>".
  const fields = Object.entries((p.customFields ?? {}) as Record<string, { label?: unknown; value?: unknown }>)
    .filter(([, f]) => f && typeof f === "object")
    .map(([k, f]) => [k, { label: String(f.label ?? k), value: String(f.value ?? "") }] as const);
  return (
    <div className="max-w-3xl">
      <PageHeader title={p.name} />
      <Card className="p-5">
        <ProductForm
          companyId={ctx.companyId}
          id={p.id}
          canDelete={can(ctx, "masters.delete")}
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
      {fields.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="mb-3 text-sm font-semibold">From apps</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {fields.map(([key, f]) => (
              <div key={key}>
                <dt className="text-xs text-muted">{f.label}</dt>
                <dd className="font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  );
}
