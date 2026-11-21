import { formatMobile } from "@/lib/phone";
import { Card, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { BUILTIN_ROLE_ID, roleNames } from "@/lib/permissions";
import { companyRoles } from "@/lib/roles";
import { requireCompanyPage } from "@/lib/tenant";
import { InviteForm, MemberActions, RevokeInviteButton } from "./users-client";

export const metadata = { title: "Users" };

export default async function UsersPage({ params }: PageProps<"/c/[companyId]/settings/users">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "company.users");
  const [members, invites] = await Promise.all([
    db.membership.findMany({
      where: { companyId: ctx.companyId },
      include: { user: { select: { name: true, email: true, phone: true } }, roles: { select: { roleId: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.invitation.findMany({ where: { companyId: ctx.companyId, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  const roles = (await companyRoles(ctx.companyId)).map(({ id, name, description, builtin }) => ({ id, name, description, builtin }));
  const inviteRoles = (ids: unknown) => roles.filter((r) => Array.isArray(ids) && ids.includes(r.id));

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">Invite a user</h2>
        <p className="mb-3 text-xs text-muted">
          <b>Owner</b>: everything incl. settings and users. <b>Accountant</b>: billing, payments, purchases and reports.{" "}
          <b>Staff</b>: create invoices, quotations and masters only. Pick several roles to combine their access; custom roles are
          managed under <b>Roles</b>.
        </p>
        <InviteForm companyId={ctx.companyId} roles={roles} defaultRoleId={BUILTIN_ROLE_ID.STAFF} />
      </Card>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Mobile</Th>
              <Th>Roles</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <Td>
                  {m.user.name}
                  {m.userId === ctx.user.id && <span className="text-muted"> (you)</span>}
                </Td>
                <Td>{m.user.email}</Td>
                <Td className="whitespace-nowrap">
                  {m.user.phone ? (
                    <a href={`tel:${m.user.phone}`} className="hover:text-primary">
                      {formatMobile(m.user.phone)}
                    </a>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
                <Td colSpan={2}>
                  <MemberActions companyId={ctx.companyId} membershipId={m.id} roles={roles} current={m.roles.map((r) => r.roleId)} name={m.user.name} />
                </Td>
              </tr>
            ))}
            {invites.map((i) => (
              <tr key={i.id} className="text-muted">
                <Td>Pending invite</Td>
                <Td>{i.email}</Td>
                <Td>—</Td>
                <Td>
                  {roleNames(inviteRoles(i.roleIds))}
                  {i.expiresAt < new Date() && " · expired"}
                </Td>
                <Td className="text-right">
                  <RevokeInviteButton companyId={ctx.companyId} inviteId={i.id} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
