import { Badge, Card, CardHeader } from "@/components/ui";
import { holdsGrantable, PERMISSION_GROUPS, PERMISSION_LABEL, pluginPermission, rolePermissions, storedPermissions, type CorePermission } from "@/lib/permissions";
import { activeEntries } from "@/lib/plugins/runner";
import { companyRoles } from "@/lib/roles";
import { requireCompanyPage } from "@/lib/tenant";
import { EditRole, NewRole } from "./roles-client";

export const metadata = { title: "Roles" };

export default async function RolesPage({ params }: PageProps<"/c/[companyId]/settings/roles">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "company.roles");
  const [roles, apps] = await Promise.all([companyRoles(ctx.companyId), activeEntries(ctx.companyId).catch(() => [])]);

  // Plugin pages/widgets become "Apps" permissions custom roles can grant.
  const appItems = apps
    .filter((e) => e.manifest.pages.length || e.manifest.widgets.length)
    .map((e) => [`app:${e.plugin.id}`, `Use ${e.manifest.name}`] as const);
  // Each plugin's own permissions (manifest `capabilities`) get a group named after the plugin.
  const pluginGroups = apps
    .filter((e) => e.manifest.capabilities.length)
    .map((e) => ({ label: e.manifest.name, items: e.manifest.capabilities.map((c) => [pluginPermission(e.plugin.id, c.key), c.label] as const) }));
  const capabilities = new Map(apps.map((e) => [e.plugin.id, e.manifest.capabilities]));
  const groups = [...PERMISSION_GROUPS.map((g) => ({ label: g.label, items: g.items })), ...(appItems.length ? [{ label: "Apps", items: appItems }] : []), ...pluginGroups]
    // Only offer permissions this member holds (no privilege escalation).
    .map((g) => ({ label: g.label, items: g.items.filter(([k]) => holdsGrantable(ctx, k, capabilities)) }))
    .filter((g) => g.items.length);
  const appLabel = new Map<string, string>([...appItems, ...pluginGroups.flatMap((g) => g.items.map(([k, l]) => [k, `${g.label}: ${l}`] as const))].map(([k, l]) => [k, l]));
  const label = (p: string) => PERMISSION_LABEL[p as CorePermission] ?? appLabel.get(p) ?? p;

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">Custom role</h2>
        <p className="mb-4 text-xs text-muted">
          Build a role from individual permissions, then give it to users on the Users tab. A user can hold several roles; they get every
          permission from all of them.
        </p>
        <NewRole companyId={ctx.companyId} groups={groups} />
      </Card>

      <Card>
        <CardHeader title="Roles" description={`${roles.length} roles · built-in roles can't be changed`} />
        <ul className="divide-y divide-border">
          {roles.map((r) => {
            const perms = rolePermissions(r);
            return (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    {r.builtin ? <Badge color="blue">Built-in</Badge> : <Badge>Custom</Badge>}
                    <span className="text-xs text-muted">
                      {r.members} {r.members === 1 ? "member" : "members"}
                    </span>
                  </div>
                  {r.description && <p className="mt-0.5 text-xs text-muted">{r.description}</p>}
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-muted hover:text-foreground">{perms.length} permissions</summary>
                    <ul className="mt-1 list-disc pl-5 text-muted">
                      {perms.map((p) => (
                        <li key={p}>{label(p)}</li>
                      ))}
                    </ul>
                  </details>
                </div>
                {!r.builtin && (
                  <EditRole
                    companyId={ctx.companyId}
                    roleId={r.id}
                    groups={groups}
                    initial={{ name: r.name, description: r.description ?? "", permissions: storedPermissions(r.permissions) }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
