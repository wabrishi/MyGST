import { BookOpen, Puzzle } from "lucide-react";
import Link from "next/link";
import { Alert, Badge, Card, CardHeader, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { isPluginActive } from "@/lib/plugins/access";
import { syncCodePlugins } from "@/lib/plugins/manage";
import { PLUGIN_PERMISSIONS, type PluginPermission } from "@/lib/plugins/manifest";
import { manifestOf } from "@/lib/plugins/runner";
import { AddExternalForm, InstallPanel, RescanButton } from "./plugins-client";

export const metadata = { title: "Plugins" };

const AVAIL_LABEL = { ALL: "All companies", SELECTED: "Selected companies", NONE: "Nobody" } as const;

export default async function AdminPluginsPage() {
  // Code plugins come with the build: register new folders, flag removed ones.
  const { broken } = await syncCodePlugins();
  const [plugins, companyCount] = await Promise.all([
    db.plugin.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }], include: { companies: true } }),
    db.company.count(),
  ]);
  const companyIds = (await db.company.findMany({ select: { id: true } })).map((c) => c.id);

  return (
    <>
      <PageHeader
        title="Plugins"
        subtitle="Install plugins, choose which companies can use them and whether they start switched on."
        actions={
          <>
            <a href="https://github.com/wabrishi/MyGST/blob/main/docs/plugins/README.md" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <BookOpen size={15} /> Developer guide
            </a>
            <RescanButton />
          </>
        }
      />
      {broken.length > 0 && (
        <div className="mb-4">
          <Alert kind="warning">
            {broken.map((b) => (
              <div key={b.folder}>
                <b>src/plugins/{b.folder}</b> failed to load: {b.error}
              </div>
            ))}
          </Alert>
        </div>
      )}

      <Card className="mb-5">
        {plugins.length === 0 ? (
          <Empty icon={Puzzle} title="No plugins yet">
            Add a code plugin under <code>src/plugins/&lt;id&gt;</code> and deploy, or load an external plugin by URL below.
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Plugin</Th>
                <Th>Status</Th>
                <Th>Available to</Th>
                <Th>Default</Th>
                <Th className="text-right">Active in</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {plugins.map((p) => {
                const manifest = manifestOf(p);
                const byCompany = new Map(p.companies.map((c) => [c.companyId, c]));
                const active = companyIds.filter((id) => isPluginActive(p, byCompany.get(id))).length;
                const perms = (manifest?.permissions ?? []).map((k) => ({ key: k, label: PLUGIN_PERMISSIONS[k as PluginPermission] }));
                return (
                  <tr key={p.id} className="align-top">
                    <Td>
                      <Link href={`/admin/plugins/${p.id}`} className="font-medium hover:text-primary">
                        {p.name}
                      </Link>
                      <div className="text-xs text-muted">
                        {p.id} · v{p.version} · {p.kind === "CODE" ? "Built-in" : "External"}
                      </div>
                      {manifest?.description && <div className="mt-0.5 max-w-md text-xs text-muted">{manifest.description}</div>}
                      {p.status === "NOT_INSTALLED" && manifest && <InstallPanel pluginId={p.id} name={p.name} permissions={perms} />}
                    </Td>
                    <Td>
                      {p.status === "INSTALLED" ? <Badge color="green">Installed</Badge> : p.status === "MISSING" ? <Badge color="red">Missing</Badge> : <Badge>Not installed</Badge>}
                      {p.lastError && <div className="mt-1 max-w-56 text-xs text-danger">{p.lastError}</div>}
                    </Td>
                    <Td>{p.status === "INSTALLED" ? AVAIL_LABEL[p.availability] : "—"}</Td>
                    <Td>{p.status === "INSTALLED" ? (p.defaultEnabled ? "On" : "Off") : "—"}</Td>
                    <Td className="text-right tabular-nums">
                      {p.status === "INSTALLED" ? `${active} / ${companyCount}` : "—"}
                    </Td>
                    <Td className="text-right">
                      <Link href={`/admin/plugins/${p.id}`} className="text-sm font-medium text-primary hover:underline">
                        Manage
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="max-w-2xl p-5">
        <CardHeader
          className="mb-3 p-0"
          title="Add an external plugin"
          description="External plugins run on their own server. They receive signed events, call the MyGST API with a key scoped to their permissions, and show pages inside MyGST in a frame."
        />
        <AddExternalForm />
      </Card>
    </>
  );
}
