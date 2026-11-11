import { Card, PageHeader } from "@/components/ui";
import { requireCompanyPage } from "@/lib/tenant";
import { ProductForm } from "../product-form";

export const metadata = { title: "New product" };

export default async function NewProductPage({ params }: PageProps<"/c/[companyId]/products/new">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "masters.write");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New product or service" />
      <Card className="p-5">
        <ProductForm companyId={ctx.companyId} id={null} />
      </Card>
    </div>
  );
}
