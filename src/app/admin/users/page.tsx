import { Users } from "lucide-react";
import Link from "next/link";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/pager";
import { SearchBox } from "@/components/search-box";
import { Badge, Card, Empty, FilterPills, PageHeader, Table, Td, Th } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { isBreakGlassAdmin, requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { roleNames } from "@/lib/permissions";
import { formatMobile } from "@/lib/phone";

export const metadata = { title: "Users" };

const FILTERS = [
  ["", "All"],
  ["active", "Active"],
  ["disabled", "Disabled"],
  ["admins", "Admins"],
  ["no-company", "No company"],
] as const;

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireAdmin("users.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const filter = typeof sp.status === "string" ? sp.status : "";
  const page = pageFrom(sp);
  const breakGlass = (process.env.SUPER_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

  const where: Prisma.UserWhereInput = {
    ...(q && { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q.replace(/\D/g, "") || q } }, { memberships: { some: { company: { legalName: { contains: q } } } } }] }),
    ...(filter === "active" && { disabledAt: null }),
    ...(filter === "disabled" && { disabledAt: { not: null } }),
    ...(filter === "admins" && { OR: [{ platformRoles: { some: {} } }, { email: { in: breakGlass } }] }),
    ...(filter === "no-company" && { memberships: { none: {} } }),
  };

  const [rows, total, disabled] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        disabledAt: true,
        memberships: { select: { company: { select: { id: true, legalName: true, tradeName: true } }, roles: { select: { role: { select: { name: true } } } } } },
        platformRoles: { select: { role: { select: { name: true } } } },
      },
    }),
    db.user.count(),
    db.user.count({ where: { disabledAt: { not: null } } }),
  ]);
  const shown = rows.slice(0, PAGE_SIZE);
  const lastSeen = await db.session.groupBy({ by: ["userId"], where: { userId: { in: shown.map((u) => u.id) } }, _max: { updatedAt: true } });
  const seen = new Map(lastSeen.map((s) => [s.userId, s._max.updatedAt]));

  return (
    <>
      <PageHeader title="Users" subtitle={`${total} total · ${disabled} disabled`} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search name, email, company" />
        <FilterPills active={filter} items={FILTERS.map(([v, l]) => ({ value: v, label: l, href: v ? `/admin/users?status=${v}` : "/admin/users" }))} />
      </div>
      <Card>
        {shown.length === 0 ? (
          <Empty icon={Users} title="No users found">
            Try a different search or filter.
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Company · roles</Th>
                <Th>Admin roles</Th>
                <Th>Last active</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => {
                const m = u.memberships[0];
                const adminRoles = [...(isBreakGlassAdmin(u) ? ["Super admin (env)"] : []), ...u.platformRoles.map((r) => r.role.name)];
                return (
                  <tr key={u.id}>
                    <Td>
                      <Link href={`/admin/users/${u.id}`} className="font-medium text-primary hover:underline">
                        {u.name}
                      </Link>
                      <div className="text-xs text-muted">
                        {u.email}
                        {u.phone && ` · ${formatMobile(u.phone)}`}
                      </div>
                    </Td>
                    <Td className="text-xs">
                      {m ? (
                        <>
                          {m.company.tradeName || m.company.legalName}
                          <div className="text-muted">{roleNames(m.roles.map((r) => r.role))}</div>
                        </>
                      ) : (
                        <span className="text-muted">No company</span>
                      )}
                    </Td>
                    <Td className="text-xs">{adminRoles.join(", ") || <span className="text-muted">—</span>}</Td>
                    <Td className="text-xs text-muted">{day(seen.get(u.id))}</Td>
                    <Td>{u.disabledAt ? <Badge color="red">Disabled</Badge> : <Badge color="green">Active</Badge>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pager page={page} hasMore={rows.length > PAGE_SIZE} basePath="/admin/users" searchParams={sp} />
      </Card>
    </>
  );
}
