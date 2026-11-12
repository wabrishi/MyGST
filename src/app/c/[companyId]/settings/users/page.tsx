import { Card, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { hubMode, hubTeamUrl } from "@/lib/hub-rules";
import { ROLE_LABEL } from "@/lib/permissions";
import { requireCompanyPage } from "@/lib/tenant";
import { InviteForm, MemberActions, RevokeInviteButton } from "./users-client";

export const metadata = { title: "Users" };

export default async function UsersPage({ params }: PageProps<"/c/[companyId]/settings/users">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "company.users");
  const [members, invites] = await Promise.all([
    db.membership.findMany({
      where: { companyId: ctx.companyId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.invitation.findMany({ where: { companyId: ctx.companyId, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  const hub = hubMode();
  const hubWorkspaceId = hub ? (await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { hubWorkspaceId: true } })).hubWorkspaceId : null;

  return (
    <div className="flex flex-col gap-5">
      {hub ? (
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Members are managed in your suite account</h2>
          <p className="mb-3 text-sm text-muted">
            Add, remove and change roles on the Team page. Hub Owner = Owner, Manager = Accountant, Member = Staff. New members get access on
            their first sign-in.
          </p>
          <a href={hubTeamUrl(hubWorkspaceId)} className="text-sm font-semibold text-primary hover:underline">
            Open Team page
          </a>
        </Card>
      ) : (
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">Invite a user</h2>
        <p className="mb-3 text-xs text-muted">
          <b>Owner</b>: everything incl. settings and users. <b>Accountant</b>: billing, payments, purchases and reports.{" "}
          <b>Staff</b>: create invoices, quotations and masters only.
        </p>
        <InviteForm companyId={ctx.companyId} />
      </Card>
      )}

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
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
                <Td colSpan={2}>
                  {hub ? ROLE_LABEL[m.role] : <MemberActions companyId={ctx.companyId} membershipId={m.id} role={m.role} />}
                </Td>
              </tr>
            ))}
            {invites.map((i) => (
              <tr key={i.id} className="text-muted">
                <Td>Pending invite</Td>
                <Td>{i.email}</Td>
                <Td>
                  {ROLE_LABEL[i.role]}
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
