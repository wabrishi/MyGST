import { ScrollText } from "lucide-react";
import Link from "next/link";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/pager";
import { SearchBox } from "@/components/search-box";
import { Card, Empty, FilterPills, PageHeader, Table, Td, Th } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { adminCan, requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { isIsoDate } from "@/lib/gst/fy";

export const metadata = { title: "Audit log" };

const when = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
const details = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = JSON.stringify(v);
  return s.length > 160 ? s.slice(0, 157) + "…" : s;
};

/**
 * Two trails: what platform admins did (platform_audit_log) and what happened inside companies
 * (audit_log: invites, role changes, cancellations, settings…). Filter by text, company and dates.
 */
export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const admin = await requireAdmin("audit.view");
  const sp = await searchParams;
  const source = sp.source === "company" ? "company" : "admin";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const companyId = typeof sp.company === "string" ? sp.company : "";
  const from = typeof sp.from === "string" && isIsoDate(sp.from) ? sp.from : "";
  const to = typeof sp.to === "string" && isIsoDate(sp.to) ? sp.to : "";
  const page = pageFrom(sp);
  const range = {
    ...(from && { gte: new Date(from + "T00:00:00Z") }),
    ...(to && { lt: new Date(new Date(to + "T00:00:00Z").getTime() + 86_400_000) }),
  };
  const dated = from || to ? { createdAt: range } : {};

  const tabs = (
    <FilterPills
      active={source}
      items={[
        { value: "admin", label: "Admin actions", href: "/admin/audit" },
        { value: "company", label: "Company activity", href: "/admin/audit?source=company" },
      ]}
    />
  );
  const filters = (
    <form className="flex flex-wrap items-end gap-2 text-sm" action="/admin/audit">
      {source === "company" && <input type="hidden" name="source" value="company" />}
      {companyId && <input type="hidden" name="company" value={companyId} />}
      {q && <input type="hidden" name="q" value={q} />}
      <label className="flex flex-col gap-1 text-xs text-muted">
        From
        <input type="date" name="from" defaultValue={from} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        To
        <input type="date" name="to" defaultValue={to} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
      </label>
      <button className="h-9 rounded-lg border border-border px-3 font-medium hover:bg-subtle">Apply</button>
    </form>
  );

  if (source === "admin") {
    const where: Prisma.PlatformAuditLogWhereInput = {
      ...dated,
      ...(q && { OR: [{ actorEmail: { contains: q } }, { action: { contains: q } }, { targetId: { contains: q } }] }),
    };
    const rows = await db.platformAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE + 1 });
    return (
      <>
        <PageHeader title="Audit log" subtitle="Who did what in the admin panel and inside companies" />
        <div className="mb-3 flex flex-wrap items-end gap-3">
          {tabs}
          <SearchBox placeholder="Search admin email, action, target" />
          {filters}
        </div>
        <Card>
          {rows.length === 0 ? (
            <Empty icon={ScrollText} title="No admin actions found">
              Admin actions (company changes, plugin installs, user changes) appear here.
            </Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>When (UTC)</Th>
                  <Th>Admin</Th>
                  <Th>Action</Th>
                  <Th>Target</Th>
                  <Th>Details</Th>
                  <Th>IP</Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PAGE_SIZE).map((r) => (
                  <tr key={r.id}>
                    <Td className="whitespace-nowrap text-xs">{when(r.createdAt)}</Td>
                    <Td className="text-xs">{r.actorEmail}</Td>
                    <Td className="font-mono text-xs">{r.action}</Td>
                    <Td className="text-xs">
                      {r.targetType === "user" && r.targetId && adminCan(admin, "users.view") ? (
                        <Link href={`/admin/users/${r.targetId}`} className="text-primary hover:underline">
                          user
                        </Link>
                      ) : r.targetType === "company" && r.targetId && adminCan(admin, "companies.view") ? (
                        <Link href={`/admin/companies/${r.targetId}`} className="text-primary hover:underline">
                          company
                        </Link>
                      ) : (
                        <>
                          {r.targetType}
                          {r.targetId && <span className="text-muted"> {r.targetId}</span>}
                        </>
                      )}
                    </Td>
                    <Td className="max-w-80 truncate font-mono text-[11px] text-muted">{details(r.data)}</Td>
                    <Td className="font-mono text-xs text-muted">{r.ip ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pager page={page} hasMore={rows.length > PAGE_SIZE} basePath="/admin/audit" searchParams={sp} />
        </Card>
      </>
    );
  }

  const where: Prisma.AuditLogWhereInput = {
    ...dated,
    ...(companyId && { companyId }),
    ...(q && { OR: [{ action: { contains: q } }, { entity: { contains: q } }, { entityId: { contains: q } }, { company: { legalName: { contains: q } } }] }),
  };
  const rows = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    include: { company: { select: { id: true, legalName: true, tradeName: true } } },
  });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, email: true } });
  const emailOf = new Map(users.map((u) => [u.id, u.email]));

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what in the admin panel and inside companies" />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        {tabs}
        <SearchBox placeholder="Search action, entity, company" />
        {filters}
      </div>
      {companyId && (
        <p className="mb-3 text-sm">
          Showing one company.{" "}
          <Link href="/admin/audit?source=company" className="text-primary hover:underline">
            Show all
          </Link>
        </p>
      )}
      <Card>
        {rows.length === 0 ? (
          <Empty icon={ScrollText} title="No company activity found" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When (UTC)</Th>
                <Th>Company</Th>
                <Th>User</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE_SIZE).map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-xs">{when(r.createdAt)}</Td>
                  <Td className="text-xs">
                    <Link href={`/admin/audit?source=company&company=${r.company.id}`} className="hover:text-primary">
                      {r.company.tradeName || r.company.legalName}
                    </Link>
                  </Td>
                  <Td className="text-xs">{emailOf.get(r.userId) ?? <span className="text-muted">deleted user</span>}</Td>
                  <Td className="font-mono text-xs">{r.action}</Td>
                  <Td className="text-xs">
                    {r.entity}
                    <span className="text-muted"> {r.entityId.slice(0, 24)}</span>
                  </Td>
                  <Td className="max-w-80 truncate font-mono text-[11px] text-muted">{details(r.data)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={page} hasMore={rows.length > PAGE_SIZE} basePath="/admin/audit" searchParams={sp} />
      </Card>
    </>
  );
}
