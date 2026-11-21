import { Puzzle } from "lucide-react";
import { Alert, Badge, Card, CardHeader, Empty } from "@/components/ui";
import { isTurnedOn } from "@/lib/plugins/access";
import { recentPluginErrors } from "@/lib/plugins/log";
import { PLUGIN_PERMISSIONS, type PluginPermission } from "@/lib/plugins/manifest";
import { contextFor, pluginEntries } from "@/lib/plugins/runner";
import { settingsForForm } from "@/lib/plugins/settings";
import { requireCompanyPage } from "@/lib/tenant";
import { PluginSettingsForm, PluginToggle, ReconnectButton } from "./plugins-client";

export const metadata = { title: "Plugins" };

export default async function CompanyPluginsPage({ params }: PageProps<"/c/[companyId]/settings/plugins">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "settings.plugins");
  const entries = (await pluginEntries(ctx.companyId)).filter((e) => e.available);
  const errors = await recentPluginErrors(ctx.companyId);

  if (!entries.length) {
    return (
      <Card>
        <Empty icon={Puzzle} title="No plugins available">
          Plugins add features to MyGSTBook, such as notifications, extra fields and integrations. Your platform administrator decides which plugins are available.
        </Empty>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {await Promise.all(
        entries.map(async (e) => {
          const on = isTurnedOn(e.plugin, e.cp);
          const form = settingsForForm(e.manifest.settings, e.cp?.settings);
          const recent = errors.filter((l) => l.pluginId === e.plugin.id).slice(0, 3);
          const SettingsExtra = e.active ? e.code?.settingsPage : null;
          return (
            <Card key={e.plugin.id} id={`plugin-${e.plugin.id}`}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {e.manifest.name}
                    <span className="text-xs font-normal text-muted">v{e.manifest.version}</span>
                    {e.active ? <Badge color="green">On</Badge> : e.cp?.pausedReason && on ? <Badge color="amber">Paused</Badge> : <Badge>Off</Badge>}
                  </span>
                }
                description={e.manifest.description}
                actions={
                  <PluginToggle
                    companyId={ctx.companyId}
                    pluginId={e.plugin.id}
                    name={e.manifest.name}
                    on={on && !e.cp?.pausedReason}
                    permissions={e.manifest.permissions.map((p) => PLUGIN_PERMISSIONS[p as PluginPermission])}
                  />
                }
              />
              <div className="flex flex-col gap-4 p-5">
                {e.cp?.pausedReason && (
                  <Alert kind="warning">
                    {e.cp.pausedReason} Fix the settings below if needed, then turn the plugin back on.
                  </Alert>
                )}
                {e.manifest.permissions.length > 0 && (
                  <p className="text-xs text-muted">
                    Can: {e.manifest.permissions.map((p) => PLUGIN_PERMISSIONS[p as PluginPermission].toLowerCase()).join("; ")}.
                  </p>
                )}
                {e.manifest.settings.length > 0 && (
                  <PluginSettingsForm companyId={ctx.companyId} pluginId={e.plugin.id} fields={e.manifest.settings} values={form.values} secretsSet={form.secretsSet} />
                )}
                {SettingsExtra && <SettingsExtra ctx={await contextFor(e, ctx.companyId, ctx.user, ctx.role)} path={[]} searchParams={{}} />}
                {e.plugin.kind === "EXTERNAL" && e.active && (
                  <div className="rounded-lg border border-border bg-surface-2 p-4 text-[13px] text-muted">
                    <p className="mb-2">
                      This plugin runs on its own server. It received an API key limited to the permissions above and a secret to verify MyGSTBook&apos;s events. If it
                      lost them, reconnect to issue new ones (the old key stops working).
                    </p>
                    <ReconnectButton companyId={ctx.companyId} pluginId={e.plugin.id} />
                  </div>
                )}
                {recent.length > 0 && (
                  <div className="text-xs">
                    <div className="mb-1 font-medium text-danger">Recent errors</div>
                    <ul className="flex flex-col gap-0.5 text-muted">
                      {recent.map((l) => (
                        <li key={l.id}>
                          {l.createdAt.toISOString().slice(0, 16).replace("T", " ")}: {l.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          );
        }),
      )}
    </div>
  );
}
