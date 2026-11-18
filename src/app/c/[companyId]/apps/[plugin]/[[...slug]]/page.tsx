import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Alert, Card, PageHeader } from "@/components/ui";
import { pluginLog } from "@/lib/plugins/log";
import { activeEntries, contextFor } from "@/lib/plugins/runner";
import { canOpenPage, externalFrameUrl } from "@/lib/plugins/ui";
import { requireCompany } from "@/lib/tenant";

export const metadata = { title: "App" };

/**
 * A plugin page: /c/<company>/apps/<plugin>/<slug>/<...path>
 * Code plugins render their server component here; external plugins are framed with a signed token.
 */
export default async function PluginPage({ params, searchParams }: PageProps<"/c/[companyId]/apps/[plugin]/[[...slug]]">) {
  const { companyId, plugin, slug = [] } = await params;
  const sp = await searchParams;
  const ctx = await requireCompany(companyId);
  const entry = (await activeEntries(ctx.companyId)).find((e) => e.plugin.id === plugin);
  if (!entry) notFound();
  const [pageSlug, ...path] = slug;
  const page = pageSlug ? entry.manifest.pages.find((p) => p.slug === pageSlug) : entry.manifest.pages[0];
  if (!page) notFound();
  if (!pageSlug) redirect(`/c/${ctx.companyId}/apps/${plugin}/${page.slug}`);
  if (!canOpenPage(ctx, entry, page)) redirect(`/c/${ctx.companyId}/dashboard?denied=1`);
  // Message from a plugin action (see /api/plugins/<plugin>/_action/<name>).
  const flash = typeof sp._ok === "string" ? sp._ok.slice(0, 300) : "";
  const flashError = typeof sp._error === "string" ? sp._error.slice(0, 300) : "";
  const notice = (flash || flashError) && (
    <div className="mb-4">
      <Alert kind={flashError ? "error" : "success"}>{flashError || flash}</Alert>
    </div>
  );

  if (entry.code) {
    const Component = entry.code.pages.get(page.slug);
    if (!Component) notFound();
    let content: ReactNode = null;
    let failed = false;
    try {
      content = await Component({ ctx: await contextFor(entry, ctx.companyId, ctx.user, ctx.role, ctx), path, searchParams: sp });
    } catch (e) {
      failed = true;
      await pluginLog(entry.plugin.id, ctx.companyId, "error", `page ${page.slug}: ${(e as Error).message}`);
    }
    return (
      <>
        <PageHeader title={page.title} eyebrow={entry.manifest.name} />
        {notice}
        {failed ? <Alert>This page couldn&apos;t be loaded. The error was logged for the plugin&apos;s developer.</Alert> : content}
      </>
    );
  }

  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : Array.isArray(v) ? v.map((x) => [k, x]) : [])));
  const src = externalFrameUrl(entry, ctx, page.slug, path, search.toString());
  return (
    <>
      <PageHeader title={page.title} eyebrow={entry.manifest.name} />
      {src ? (
        <Card className="overflow-hidden">
          <iframe
            src={src}
            title={`${entry.manifest.name}: ${page.title}`}
            className="block h-[75vh] w-full border-0 bg-surface"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads"
            referrerPolicy="no-referrer"
          />
        </Card>
      ) : (
        <Alert>This plugin isn&apos;t connected for your company yet. Ask an owner to reconnect it in Settings → Plugins.</Alert>
      )}
    </>
  );
}
