import { Package } from "lucide-react";
import Link from "next/link";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/pager";
import { SearchBox } from "@/components/search-box";
import { ButtonLink, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst/calc";
import { requireCompany } from "@/lib/tenant";

export const metadata = { title: "Products" };

export default async function ProductsPage({ params, searchParams }: PageProps<"/c/[companyId]/products">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await requireCompany(companyId);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = pageFrom(sp);
  const rows = await db.product.findMany({
    where: { companyId: ctx.companyId, active: true, ...(q && { OR: [{ name: { contains: q } }, { hsnSac: { startsWith: q } }] }) },
    orderBy: { name: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });
  const base = `/c/${ctx.companyId}/products`;

  return (
    <>
      <PageHeader title="Products & services" actions={<ButtonLink href={`${base}/new`}>+ New product</ButtonLink>} />
      <div className="mb-3">
        <SearchBox placeholder="Search name or HSN" />
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty
            icon={Package}
            title={q ? "No matches" : "No products yet"}
            action={!q && <ButtonLink href={`${base}/new`} size="sm">Add a product</ButtonLink>}
          >
            {q ? "No products match your search." : "Save products and services with HSN/SAC and GST rate to bill faster."}
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>HSN/SAC</Th>
                <Th>Unit</Th>
                <Th className="text-right">Sale price</Th>
                <Th className="text-right">GST</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE_SIZE).map((p) => (
                <tr key={p.id} className="hover:bg-background">
                  <Td>
                    <Link href={`${base}/${p.id}`} className="font-medium text-primary hover:underline">
                      {p.name}
                    </Link>
                    {p.isService && <span className="ml-2 text-xs text-muted">Service</span>}
                  </Td>
                  <Td className="font-mono text-xs">{p.hsnSac}</Td>
                  <Td>{p.unit}</Td>
                  <Td className="tabular text-right">{formatINR(toPaise(p.salePrice.toNumber()))}</Td>
                  <Td className="text-right">{p.gstRate.toNumber()}%</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={page} hasMore={rows.length > PAGE_SIZE} basePath={base} searchParams={sp} />
      </Card>
    </>
  );
}
