import { Building2 } from "lucide-react";
import Link from "next/link";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/pager";
import { SearchBox } from "@/components/search-box";
import { Badge, ButtonLink, Card, Empty, FilterPills, PageHeader, Table, Td, Th } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { stateName } from "@/lib/gst/states";

export const metadata = { title: "Companies" };

const FILTERS = [
  ["", "All"],
  ["setup", "Setup pending"],
  ["active", "Active"],
  ["suspended", "Suspended"],
] as const;

export default async function AdminCompaniesPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const filter = typeof sp.status === "string" ? sp.status : "";
  const page = pageFrom(sp);

  const where: Prisma.CompanyWhereInput = {
    ...(q && { OR: [{ legalName: { contains: q } }, { tradeName: { contains: q } }, { gstin: { contains: q } }, { memberships: { some: { user: { email: { contains: q } } } } }] }),
    ...(filter === "setup" && { setupCompletedAt: null, suspendedAt: null }),
    ...(filter === "active" && { suspendedAt: null }),
    ...(filter === "suspended" && { suspendedAt: { not: null } }),
  };

  const [rows, total, suspended, pending] = await Promise.all([
    db.company.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        gstin: true,
        stateCode: true,
        createdAt: true,
        createdVia: true,
        setupCompletedAt: true,
        suspendedAt: true,
        memberships: { where: { role: "OWNER" }, select: { user: { select: { email: true } } } },
        invitations: { where: { acceptedAt: null, role: "OWNER" }, select: { email: true } },
        _count: { select: { memberships: true, documents: true } },
      },
    }),
    db.company.count(),
    db.company.count({ where: { suspendedAt: { not: null } } }),
    db.company.count({ where: { setupCompletedAt: null, suspendedAt: null } }),
  ]);

  return (
    <>
      <PageHeader
        title="Companies"
        subtitle={`${total} total · ${pending} with setup pending · ${suspended} suspended`}
        actions={<ButtonLink href="/admin/companies/new">+ New company</ButtonLink>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search name, GSTIN, owner email" />
        <FilterPills active={filter} items={FILTERS.map(([v, l]) => ({ value: v, label: l, href: v ? `/admin?status=${v}` : "/admin" }))} />
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty icon={Building2} title="No companies found">Try a different search or filter.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Company</Th>
                <Th>GSTIN</Th>
                <Th>Owner</Th>
                <Th className="text-right">Users</Th>
                <Th className="text-right">Documents</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE_SIZE).map((c) => (
                <tr key={c.id} className="hover:bg-background">
                  <Td>
                    <Link href={`/admin/companies/${c.id}`} className="font-medium text-primary hover:underline">
                      {c.tradeName || c.legalName}
                    </Link>
                    <div className="text-xs text-muted">{stateName(c.stateCode)}</div>
                  </Td>
                  <Td className="font-mono text-xs">{c.gstin || "—"}</Td>
                  <Td className="text-xs">
                    {c.memberships.map((m) => m.user.email).join(", ") ||
                      (c.invitations.length ? <span className="text-muted">Invited: {c.invitations.map((i) => i.email).join(", ")}</span> : <span className="text-danger">No owner</span>)}
                  </Td>
                  <Td className="text-right">{c._count.memberships}</Td>
                  <Td className="text-right">{c._count.documents}</Td>
                  <Td>
                    {c.suspendedAt ? <Badge color="red">Suspended</Badge> : c.setupCompletedAt ? <Badge color="green">Active</Badge> : <Badge color="amber">Setup pending</Badge>}
                  </Td>
                  <Td className="text-xs text-muted">
                    {c.createdAt.toISOString().slice(0, 10)}
                    {c.createdVia === "ADMIN" && " · by admin"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={page} hasMore={rows.length > PAGE_SIZE} basePath="/admin" searchParams={sp} />
      </Card>
    </>
  );
}
