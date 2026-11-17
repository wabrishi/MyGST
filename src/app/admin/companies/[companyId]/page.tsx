import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { adminCan, requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { stateName } from "@/lib/gst/states";
import { roleNames } from "@/lib/permissions";
import { STATE_LABEL, companyPluginState } from "@/lib/plugins/access";
import { setupStatus } from "@/lib/setup";
import { CompanyAccessToggle } from "../../plugins/plugins-client";
import { AdminInviteForm, SuspendButton } from "./admin-company-client";

export const metadata = { title: "Company" };

export default async function AdminCompanyPage({ params }: PageProps<"/admin/companies/[companyId]">) {
  const { companyId } = await params;
  const admin = await requireAdmin("companies.view");
  const manage = adminCan(admin, "companies.manage");
  const c = await db.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      gstin: true,
      stateCode: true,
      address: true,
      email: true,
      phone: true,
      createdAt: true,
      createdVia: true,
      setupCompletedAt: true,
      suspendedAt: true,
      memberships: { orderBy: { createdAt: "asc" }, select: { id: true, createdAt: true, user: { select: { id: true, name: true, email: true } }, roles: { select: { role: { select: { name: true } } } } } },
      invitations: { where: { acceptedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, email: true, roleIds: true, expiresAt: true } },
      _count: { select: { documents: true, purchases: true, payments: true, parties: true, products: true } },
    },
  });
  if (!c) notFound();
  const status = await setupStatus(c.id);
  const roleRows = await db.companyRole.findMany({ where: { OR: [{ companyId: null }, { companyId: c.id }] }, select: { id: true, name: true } });
  const inviteRoleNames = (ids: unknown) => roleNames(roleRows.filter((r) => Array.isArray(ids) && ids.includes(r.id)));
  const plugins = await db.plugin.findMany({ where: { status: "INSTALLED" }, orderBy: { name: "asc" }, include: { companies: { where: { companyId: c.id } } } });

  return (
    <>
      <Link href="/admin/companies" className="text-xs text-primary hover:underline">
        ← All companies
      </Link>
      <PageHeader
        title={c.tradeName || c.legalName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {c.suspendedAt ? <Badge color="red">Suspended</Badge> : c.setupCompletedAt ? <Badge color="green">Active</Badge> : <Badge color="amber">Setup pending</Badge>}
            {c.gstin || "Unregistered"} · {stateName(c.stateCode)} · created {c.createdAt.toISOString().slice(0, 10)}
            {c.createdVia === "ADMIN" ? " by admin" : " via sign-up"}
          </span>
        }
        actions={manage && <SuspendButton companyId={c.id} suspended={!!c.suspendedAt} />}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="p-3 font-semibold">Users</h2>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Roles</Th>
                  <Th>Since</Th>
                </tr>
              </thead>
              <tbody>
                {c.memberships.map((m) => (
                  <tr key={m.id}>
                    <Td>
                      {adminCan(admin, "users.view") ? (
                        <Link href={`/admin/users/${m.user.id}`} className="text-primary hover:underline">
                          {m.user.name}
                        </Link>
                      ) : (
                        m.user.name
                      )}
                    </Td>
                    <Td>{m.user.email}</Td>
                    <Td>{roleNames(m.roles.map((r) => r.role))}</Td>
                    <Td className="text-xs text-muted">{m.createdAt.toISOString().slice(0, 10)}</Td>
                  </tr>
                ))}
                {c.invitations.map((i) => (
                  <tr key={i.id} className="text-muted">
                    <Td>Pending invite</Td>
                    <Td>{i.email}</Td>
                    <Td>{inviteRoleNames(i.roleIds)}</Td>
                    <Td className="text-xs">{i.expiresAt < new Date() ? "expired" : `expires ${i.expiresAt.toISOString().slice(0, 10)}`}</Td>
                  </tr>
                ))}
                {c.memberships.length + c.invitations.length === 0 && (
                  <tr>
                    <Td colSpan={4} className="text-danger">
                      No owner — invite one below.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
          {manage && (
            <Card className="p-4">
              <h2 className="mb-1 font-semibold">Invite owner or user</h2>
              <p className="mb-3 text-xs text-muted">Re-inviting an email replaces its previous pending link.</p>
              <AdminInviteForm companyId={c.id} />
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="mb-2 font-semibold">
              Setup progress <span className="text-sm font-normal text-muted">({status.percent}%)</span>
            </h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {status.steps.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  {s.done ? <Check size={14} className="text-success" aria-label="done" /> : <Circle size={14} className="text-muted" aria-label="pending" />}
                  {s.title}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">{status.finished ? "Owner finished the wizard." : "Owner hasn't finished the wizard yet."}</p>
          </Card>
          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Usage</h2>
            <dl className="grid grid-cols-2 gap-y-1">
              <dt className="text-muted">Sales documents</dt>
              <dd className="text-right">{c._count.documents}</dd>
              <dt className="text-muted">Purchase bills</dt>
              <dd className="text-right">{c._count.purchases}</dd>
              <dt className="text-muted">Payments</dt>
              <dd className="text-right">{c._count.payments}</dd>
              <dt className="text-muted">Parties</dt>
              <dd className="text-right">{c._count.parties}</dd>
              <dt className="text-muted">Products</dt>
              <dd className="text-right">{c._count.products}</dd>
            </dl>
            <p className="mt-2 text-xs text-muted">Super-admins see counts only — company books stay private to its members.</p>
          </Card>
          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Plugins</h2>
            {plugins.length === 0 ? (
              <p className="text-muted">
                No plugins installed. <Link href="/admin/plugins" className="text-primary hover:underline">Manage plugins</Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {plugins.map((p) => {
                  const cp = p.companies[0];
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <Link href={`/admin/plugins/${p.id}`} className="font-medium hover:text-primary">
                          {p.name}
                        </Link>
                        <span className="block text-xs text-muted">{STATE_LABEL[companyPluginState(p, cp)]}</span>
                      </span>
                      {adminCan(admin, "plugins.manage") && p.availability === "SELECTED" && <CompanyAccessToggle pluginId={p.id} companyId={c.id} mode="allow" on={!!cp?.allowed} />}
                      {adminCan(admin, "plugins.manage") && p.availability === "ALL" && <CompanyAccessToggle pluginId={p.id} companyId={c.id} mode="block" on={!!cp?.blocked} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
