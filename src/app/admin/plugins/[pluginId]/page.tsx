import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchBox } from "@/components/search-box";
import { Alert, Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { isSuperAdmin, requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { STATE_LABEL, companyPluginState, type CompanyPluginState } from "@/lib/plugins/access";
import { PLUGIN_EVENTS, PLUGIN_PERMISSIONS, type PluginEvent, type PluginPermission } from "@/lib/plugins/manifest";
import { manifestOf } from "@/lib/plugins/runner";
import { codeFor, uploadedLoadError } from "@/lib/plugins/uploaded";
import { AvailabilityForm, CompanyAccessToggle, InstallPanel, UninstallButton } from "../plugins-client";

export const metadata = { title: "Plugin" };

const STATE_COLOR: Record<CompanyPluginState, "green" | "gray" | "amber" | "red" | "blue"> = {
  ACTIVE: "green",
  OFF: "gray",
  PAUSED: "amber",
  BLOCKED: "red",
  NOT_ALLOWED: "gray",
  UNAVAILABLE: "gray",
};

export default async function AdminPluginPage({ params, searchParams }: PageProps<"/admin/plugins/[pluginId]">) {
  const admin = await requireAdmin("plugins.manage");
  const { pluginId } = await params;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const plugin = await db.plugin.findUnique({ where: { id: pluginId }, omit: { bundle: true } });
  if (!plugin) notFound();
  const manifest = manifestOf(plugin);
  // Loads (and caches) an uploaded bundle so a broken one is reported here.
  const uploadError = plugin.kind === "UPLOADED" ? ((await codeFor(plugin)) ? null : (uploadedLoadError(plugin.id, plugin.bundleSha256) ?? "the bundle is missing")) : null;
  const [companies, cps, logs] = await Promise.all([
    db.company.findMany({
      where: q ? { OR: [{ legalName: { contains: q } }, { tradeName: { contains: q } }, { gstin: { contains: q } }] } : undefined,
      orderBy: { legalName: "asc" },
      take: 100,
      select: { id: true, legalName: true, tradeName: true, gstin: true },
    }),
    db.companyPlugin.findMany({ where: { pluginId } }),
    db.pluginLog.findMany({ where: { pluginId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const byCompany = new Map(cps.map((c) => [c.companyId, c]));
  const companyName = new Map(companies.map((c) => [c.id, c.tradeName || c.legalName]));
  const installed = plugin.status === "INSTALLED";
  const perms = (manifest?.permissions ?? []).map((k) => ({ key: k, label: PLUGIN_PERMISSIONS[k as PluginPermission] }));

  return (
    <>
      <Link href="/admin/plugins" className="text-xs text-primary hover:underline">
        ← All plugins
      </Link>
      <PageHeader
        title={plugin.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {installed ? <Badge color="green">Installed</Badge> : plugin.status === "MISSING" ? <Badge color="red">Missing</Badge> : <Badge>Not installed</Badge>}
            {plugin.id} · v{plugin.version} · {plugin.kind === "CODE" ? "Built-in (src/plugins)" : plugin.kind === "UPLOADED" ? "Uploaded" : "External"}
            {manifest?.author && ` · by ${manifest.author}`}
          </span>
        }
        actions={plugin.status !== "NOT_INSTALLED" || plugin.kind !== "CODE" ? <UninstallButton pluginId={plugin.id} kind={plugin.kind} /> : undefined}
      />

      {uploadError && (
        <div className="mb-4">
          <Alert>This uploaded plugin failed to load and is switched off everywhere: {uploadError}</Alert>
        </div>
      )}
      {plugin.kind === "UPLOADED" && (
        <Card className="mb-4 p-4 text-sm">
          <h2 className="mb-1 font-semibold">Uploaded code</h2>
          <p className="text-xs text-muted">
            Uploaded by {plugin.uploadedBy ?? "unknown"} · last change {plugin.updatedAt.toISOString().slice(0, 10)}
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-muted">SHA-256 {plugin.bundleSha256}</p>
          <p className="mt-2 text-xs text-muted">To update it, upload a newer version on the Plugins page.</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          {!installed && manifest && plugin.status !== "MISSING" && (
            <Card className="p-5">
              <p className="text-sm text-muted">{manifest.description || "This plugin is not installed yet."}</p>
              <InstallPanel pluginId={plugin.id} name={plugin.name} permissions={perms} />
            </Card>
          )}

          {installed && (
            <Card>
              <CardHeader
                title="Companies"
                description={
                  plugin.availability === "SELECTED"
                    ? "Only companies you allow can use this plugin."
                    : plugin.availability === "ALL"
                      ? "Every company can use this plugin unless you block it."
                      : "Switched off for everyone. Choose an availability to turn it on."
                }
                actions={<SearchBox placeholder="Search companies" />}
              />
              <Table>
                <thead>
                  <tr>
                    <Th>Company</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Access</Th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => {
                    const cp = byCompany.get(c.id);
                    const state = companyPluginState(plugin, cp);
                    return (
                      <tr key={c.id}>
                        <Td>
                          <Link href={`/admin/companies/${c.id}`} className="font-medium hover:text-primary">
                            {c.tradeName || c.legalName}
                          </Link>
                          <div className="font-mono text-xs text-muted">{c.gstin || "Unregistered"}</div>
                        </Td>
                        <Td>
                          <Badge color={STATE_COLOR[state]}>{STATE_LABEL[state]}</Badge>
                          {cp?.pausedReason && <div className="mt-1 max-w-72 text-xs text-warning">{cp.pausedReason}</div>}
                        </Td>
                        <Td className="text-right">
                          {plugin.availability === "SELECTED" && <CompanyAccessToggle pluginId={plugin.id} companyId={c.id} mode="allow" on={!!cp?.allowed} />}
                          {plugin.availability === "ALL" && <CompanyAccessToggle pluginId={plugin.id} companyId={c.id} mode="block" on={!!cp?.blocked} />}
                        </Td>
                      </tr>
                    );
                  })}
                  {companies.length === 0 && (
                    <tr>
                      <Td colSpan={3} className="text-center text-muted">
                        No companies found.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card>
          )}

          <Card>
            <CardHeader title="Activity log" description="Last 50 entries: installs, errors, pauses." />
            {logs.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">Nothing logged yet.</p>
            ) : (
              <Table>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="align-top">
                      <Td className="whitespace-nowrap text-xs text-muted">{l.createdAt.toISOString().replace("T", " ").slice(0, 19)}</Td>
                      <Td>
                        <Badge color={l.level === "error" ? "red" : l.level === "warn" ? "amber" : "gray"}>{l.level}</Badge>
                      </Td>
                      <Td className="text-xs text-muted">{l.companyId ? (companyName.get(l.companyId) ?? l.companyId) : "Platform"}</Td>
                      <Td className="text-[13px]">{l.message}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {isSuperAdmin(admin) && plugin.status !== "MISSING" && (
            <Card className="p-5 text-sm">
              <h2 className="mb-1 font-semibold">Download</h2>
              <p className="mb-3 text-xs text-muted">
                {plugin.kind === "EXTERNAL"
                  ? "The plugin's manifest.json. Load it on another MyGST by URL."
                  : "The packed plugin file. Upload it on another MyGST under Admin → Plugins → Upload a plugin."}{" "}
                Only super admins see this.
              </p>
              <a href={`/admin/plugins/${plugin.id}/download`} download className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 font-medium hover:bg-surface-2">
                <Download size={15} /> Download {plugin.kind === "EXTERNAL" ? "manifest.json" : `${plugin.id}-${plugin.version}.mygst-plugin.js`}
              </a>
            </Card>
          )}
          {installed && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Availability</h2>
              <AvailabilityForm pluginId={plugin.id} availability={plugin.availability} defaultEnabled={plugin.defaultEnabled} />
            </Card>
          )}
          <Card className="p-5 text-sm">
            <h2 className="mb-2 font-semibold">Permissions</h2>
            {perms.length ? (
              <ul className="list-disc pl-5">
                {perms.map((p) => (
                  <li key={p.key}>
                    {p.label} <span className="font-mono text-xs text-muted">{p.key}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">None</p>
            )}
            {manifest && manifest.events.length > 0 && (
              <>
                <h2 className="mb-2 mt-4 font-semibold">Listens to</h2>
                <ul className="list-disc pl-5">
                  {manifest.events.map((e) => (
                    <li key={e}>{PLUGIN_EVENTS[e as PluginEvent]}</li>
                  ))}
                </ul>
              </>
            )}
            {manifest && (manifest.pages.length > 0 || manifest.widgets.length > 0 || manifest.filters.length > 0 || manifest.collections.length > 0 || manifest.jobs.length > 0) && (
              <>
                <h2 className="mb-2 mt-4 font-semibold">Adds</h2>
                <ul className="list-disc pl-5">
                  {manifest.pages.map((p) => (
                    <li key={p.slug}>Page: {p.title}</li>
                  ))}
                  {manifest.widgets.map((w) => (
                    <li key={w.id}>Dashboard widget: {w.title}</li>
                  ))}
                  {manifest.filters.map((f) => (
                    <li key={f}>
                      Hook: <span className="font-mono text-xs">{f}</span>
                    </li>
                  ))}
                  {manifest.collections.map((c) => (
                    <li key={c.name}>
                      Data table: <span className="font-mono text-xs">{c.name}</span>
                    </li>
                  ))}
                  {manifest.jobs.map((j) => (
                    <li key={j.id}>
                      {j.every === "daily" ? "Daily" : "Hourly"} job: {j.title ?? j.id}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {manifest && manifest.capabilities.length > 0 && (
              <>
                <h2 className="mb-2 mt-4 font-semibold">Role permissions</h2>
                <ul className="list-disc pl-5">
                  {manifest.capabilities.map((c) => (
                    <li key={c.key}>
                      {c.label} <span className="text-xs text-muted">(default: {["OWNER", ...c.roles.filter((r) => r !== "OWNER")].map((r) => r.charAt(0) + r.slice(1).toLowerCase()).join(", ")})</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {plugin.manifestUrl && (
              <p className="mt-4 break-all text-xs text-muted">
                Manifest: <a href={plugin.manifestUrl}>{plugin.manifestUrl}</a>
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
