import Link from "next/link";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { ADMIN_PERMISSION_GROUPS, platformRolePermissions, storedAdminPermissions } from "@/lib/admin-permissions";
import { db } from "@/lib/db";
import { EditPlatformRole, NewPlatformRole } from "./roles-client";

export const metadata = { title: "Admin roles" };

const LABEL = new Map<string, string>(ADMIN_PERMISSION_GROUPS.flatMap((g) => g.items.map(([k, l]) => [k, l] as [string, string])));

export default async function AdminRolesPage() {
  await requireAdmin("roles.manage");
  const roles = await db.platformRole.findMany({
    orderBy: { createdAt: "asc" },
    include: { users: { take: 20, orderBy: { createdAt: "asc" }, select: { user: { select: { id: true, email: true } } } }, _count: { select: { users: true } } },
  });
  const breakGlass = (process.env.SUPER_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);

  return (
    <>
      <PageHeader title="Admin roles" subtitle="Who can do what in this admin panel. Give roles to people on their user page." />
      <div className="mb-5">
        <Alert kind="info">
          {breakGlass.length
            ? `${breakGlass.length} email(s) in SUPER_ADMIN_EMAILS are always full super admins, so the panel can't be locked out.`
            : "SUPER_ADMIN_EMAILS is empty: only people with an admin role below can open this panel."}
        </Alert>
      </div>

      <Card className="mb-5 p-5">
        <NewPlatformRole />
      </Card>

      <Card>
        <CardHeader title="Roles" description="Built-in roles can't be changed. A person with several roles gets all their permissions." />
        <ul className="divide-y divide-border">
          {roles.map((r) => {
            const perms = platformRolePermissions(r);
            return (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    {r.key ? <Badge color="blue">Built-in</Badge> : <Badge>Custom</Badge>}
                    <span className="text-xs text-muted">
                      {r._count.users} {r._count.users === 1 ? "person" : "people"}
                    </span>
                  </div>
                  {r.description && <p className="mt-0.5 text-xs text-muted">{r.description}</p>}
                  {r.users.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-x-2 text-xs">
                      {r.users.map(({ user }) => (
                        <Link key={user.id} href={`/admin/users/${user.id}`} className="text-primary hover:underline">
                          {user.email}
                        </Link>
                      ))}
                    </p>
                  )}
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-muted hover:text-foreground">{perms.length} permissions</summary>
                    <ul className="mt-1 list-disc pl-5 text-muted">
                      {perms.map((p) => (
                        <li key={p}>{LABEL.get(p) ?? p}</li>
                      ))}
                    </ul>
                  </details>
                </div>
                {!r.key && <EditPlatformRole roleId={r.id} initial={{ name: r.name, description: r.description ?? "", permissions: storedAdminPermissions(r.permissions) }} />}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
