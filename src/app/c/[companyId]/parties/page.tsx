import Link from "next/link";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/pager";
import { SearchBox } from "@/components/search-box";
import { Badge, ButtonLink, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { stateName } from "@/lib/gst/states";
import { requireCompany } from "@/lib/tenant";

export const metadata = { title: "Parties" };

const TYPE_LABEL = { CUSTOMER: "Customer", SUPPLIER: "Supplier", BOTH: "Both" } as const;

export default async function PartiesPage({ params, searchParams }: PageProps<"/c/[companyId]/parties">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await requireCompany(companyId);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const type = typeof sp.type === "string" ? sp.type : "";
  const page = pageFrom(sp);

  const where: Prisma.PartyWhereInput = {
    companyId: ctx.companyId,
    active: true,
    ...(q && { OR: [{ name: { contains: q } }, { gstin: { contains: q } }, { phone: { contains: q } }] }),
    ...(type === "customers" && { type: { in: ["CUSTOMER", "BOTH"] } }),
    ...(type === "suppliers" && { type: { in: ["SUPPLIER", "BOTH"] } }),
  };
  const rows = await db.party.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE + 1 });
  const base = `/c/${ctx.companyId}/parties`;

  return (
    <>
      <PageHeader title="Parties" subtitle="Customers and suppliers" actions={<ButtonLink href={`${base}/new`}>+ New party</ButtonLink>} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search name, GSTIN, phone" />
        <div className="flex gap-1 text-xs">
          {[
            ["", "All"],
            ["customers", "Customers"],
            ["suppliers", "Suppliers"],
          ].map(([v, l]) => (
            <Link
              key={v}
              href={v ? `${base}?type=${v}` : base}
              className={`rounded-full px-3 py-1 ${type === v ? "bg-primary text-white" : "bg-surface text-muted border border-border"}`}
            >
              {l}
            </Link>
          ))}
        </div>
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty>{q ? "No parties match your search." : "No parties yet. Add your first customer."}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>GSTIN</Th>
                <Th>State</Th>
                <Th>Phone</Th>
                <Th>Type</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE_SIZE).map((p) => (
                <tr key={p.id} className="hover:bg-background">
                  <Td>
                    <Link href={`${base}/${p.id}`} className="font-medium text-primary hover:underline">
                      {p.name}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs">{p.gstin || <Badge>Unregistered</Badge>}</Td>
                  <Td>{stateName(p.stateCode)}</Td>
                  <Td>{p.phone}</Td>
                  <Td>{TYPE_LABEL[p.type]}</Td>
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
