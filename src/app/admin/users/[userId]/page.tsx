import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { adminCan, isBreakGlassAdmin, requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { roleNames } from "@/lib/permissions";
import { AccountActions, PlatformRolesForm, TempPasswordForm } from "./user-client";

export const metadata = { title: "User" };

const when = (d: Date | null | undefined) => (d ? d.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[userId]">) {
  const admin = await requireAdmin("users.view");
  const { userId } = await params;
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      disabledAt: true,
      accounts: { select: { providerId: true } },
      memberships: {
        select: {
          createdAt: true,
          company: { select: { id: true, legalName: true, tradeName: true, suspendedAt: true } },
          roles: { select: { role: { select: { name: true } } } },
        },
      },
      platformRoles: { select: { roleId: true } },
      sessions: { orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, createdAt: true, updatedAt: true, expiresAt: true, ipAddress: true, userAgent: true } },
    },
  });
  if (!u) notFound();
  const [platformRoles, activity] = await Promise.all([
    db.platformRole.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, description: true } }),
    db.platformAuditLog.findMany({ where: { targetType: "user", targetId: u.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const manage = adminCan(admin, "users.manage");
  const m = u.memberships[0];
  const signIn = u.accounts.map((a) => (a.providerId === "credential" ? "password" : a.providerId)).join(", ") || "none";

  return (
    <>
      <Link href="/admin/users" className="text-xs text-primary hover:underline">
        ← All users
      </Link>
      <PageHeader
        title={u.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {u.disabledAt ? <Badge color="red">Disabled {u.disabledAt.toISOString().slice(0, 10)}</Badge> : <Badge color="green">Active</Badge>}
            {u.email} · joined {u.createdAt.toISOString().slice(0, 10)} · sign-in: {signIn}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Company</h2>
            {m ? (
              <p className="flex flex-wrap items-center gap-1.5">
                {adminCan(admin, "companies.view") ? (
                  <Link href={`/admin/companies/${m.company.id}`} className="font-medium text-primary hover:underline">
                    {m.company.tradeName || m.company.legalName}
                  </Link>
                ) : (
                  <span className="font-medium">{m.company.tradeName || m.company.legalName}</span>
                )}
                <span className="text-muted">
                  · {roleNames(m.roles.map((r) => r.role))} · since {m.createdAt.toISOString().slice(0, 10)}
                </span>
                {m.company.suspendedAt && <Badge color="red">Company suspended</Badge>}
              </p>
            ) : (
              <p className="text-muted">Not a member of any company.</p>
            )}
          </Card>

          {manage && (
            <Card className="p-4">
              <h2 className="mb-3 font-semibold">Account</h2>
              <AccountActions userId={u.id} disabled={!!u.disabledAt} self={u.id === admin.user.id} />
            </Card>
          )}
          {manage && (
            <Card className="p-4">
              <h2 className="mb-3 font-semibold">Set a temporary password</h2>
              <TempPasswordForm userId={u.id} />
            </Card>
          )}

          <Card>
            <CardHeader title="Recent sessions" description="Last 10, newest first" />
            <Table>
              <thead>
                <tr>
                  <Th>Last active</Th>
                  <Th>Started</Th>
                  <Th>IP</Th>
                  <Th>Device</Th>
                </tr>
              </thead>
              <tbody>
                {u.sessions.map((s) => (
                  <tr key={s.id} className={s.expiresAt < new Date() ? "text-muted" : undefined}>
                    <Td className="text-xs">{when(s.updatedAt)}</Td>
                    <Td className="text-xs">{when(s.createdAt)}</Td>
                    <Td className="font-mono text-xs">{s.ipAddress || "—"}</Td>
                    <Td className="max-w-64 truncate text-xs">{s.userAgent || "—"}</Td>
                  </tr>
                ))}
                {u.sessions.length === 0 && (
                  <tr>
                    <Td colSpan={4} className="text-muted">
                      No sessions.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="mb-1 font-semibold">Admin roles</h2>
            <p className="mb-3 text-xs text-muted">Access to this admin panel. Several roles combine their permissions.</p>
            {isBreakGlassAdmin(u) && (
              <div className="mb-3">
                <Alert kind="info">Listed in SUPER_ADMIN_EMAILS: always a full super admin, whatever is ticked here.</Alert>
              </div>
            )}
            <PlatformRolesForm userId={u.id} roles={platformRoles} current={u.platformRoles.map((r) => r.roleId)} canEdit={adminCan(admin, "roles.manage")} />
          </Card>
          {adminCan(admin, "audit.view") && (
            <Card className="p-4 text-sm">
              <h2 className="mb-2 font-semibold">Admin actions on this user</h2>
              {activity.length === 0 ? (
                <p className="text-muted">None yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-xs">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <span className="font-medium">{a.action}</span> by {a.actorEmail}
                      <span className="block text-muted">{when(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
