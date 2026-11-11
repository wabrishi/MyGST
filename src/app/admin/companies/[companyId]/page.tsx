import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { stateName } from "@/lib/gst/states";
import { ROLE_LABEL } from "@/lib/permissions";
import { setupStatus } from "@/lib/setup";
import { AdminInviteForm, SuspendButton } from "./admin-company-client";

export const metadata = { title: "Company" };

export default async function AdminCompanyPage({ params }: PageProps<"/admin/companies/[companyId]">) {
  const { companyId } = await params;
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
      memberships: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, createdAt: true, user: { select: { name: true, email: true } } } },
      invitations: { where: { acceptedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, email: true, role: true, expiresAt: true } },
      _count: { select: { documents: true, purchases: true, payments: true, parties: true, products: true } },
    },
  });
  if (!c) notFound();
  const status = await setupStatus(c.id);

  return (
    <>
      <Link href="/admin" className="text-xs text-primary hover:underline">
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
        actions={<SuspendButton companyId={c.id} suspended={!!c.suspendedAt} />}
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
                  <Th>Role</Th>
                  <Th>Since</Th>
                </tr>
              </thead>
              <tbody>
                {c.memberships.map((m) => (
                  <tr key={m.id}>
                    <Td>{m.user.name}</Td>
                    <Td>{m.user.email}</Td>
                    <Td>{ROLE_LABEL[m.role]}</Td>
                    <Td className="text-xs text-muted">{m.createdAt.toISOString().slice(0, 10)}</Td>
                  </tr>
                ))}
                {c.invitations.map((i) => (
                  <tr key={i.id} className="text-muted">
                    <Td>Pending invite</Td>
                    <Td>{i.email}</Td>
                    <Td>{ROLE_LABEL[i.role]}</Td>
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
          <Card className="p-4">
            <h2 className="mb-1 font-semibold">Invite owner or user</h2>
            <p className="mb-3 text-xs text-muted">Re-inviting an email replaces its previous pending link.</p>
            <AdminInviteForm companyId={c.id} />
          </Card>
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
        </div>
      </div>
    </>
  );
}
