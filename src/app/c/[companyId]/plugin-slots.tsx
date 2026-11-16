import Link from "next/link";
import { Card, CardHeader, cn } from "@/components/ui";
import { activeEntries, applyFilters } from "@/lib/plugins/runner";
import type { DocumentSummary, LinkItem } from "@/lib/plugins/sdk";
import { companyHref, externalFrameUrl, pluginWidgets, renderCodeWidget } from "@/lib/plugins/ui";
import type { CompanyContext } from "@/lib/tenant";

/** Server-rendered places where plugins add UI (dashboard widgets, document links, report entries). */

const WIDTH = { third: "lg:col-span-1", half: "lg:col-span-3", full: "lg:col-span-6" } as const;

export async function PluginWidgets({ ctx }: { ctx: CompanyContext }) {
  const slots = await pluginWidgets(ctx).catch(() => []);
  if (!slots.length) return null;
  const rendered = await Promise.all(
    slots.map(async (s) => ({
      s,
      body: s.entry.code ? await renderCodeWidget(s, ctx) : null,
      frame: s.entry.code ? null : externalFrameUrl(s.entry, ctx, `widget:${s.widgetId}`),
    })),
  );
  const visible = rendered.filter((r) => r.body || r.frame);
  if (!visible.length) return null;
  return (
    <section aria-label="Plugin widgets" className="mt-6 grid gap-4 lg:grid-cols-6">
      {visible.map(({ s, body, frame }) => (
        <Card key={s.key} className={cn("overflow-hidden", s.width === "third" ? "lg:col-span-2" : WIDTH[s.width])} data-testid={`widget-${s.key}`}>
          <CardHeader title={s.title} description={s.entry.manifest.name} />
          {frame ? (
            <iframe src={frame} title={s.title} className="block h-56 w-full border-0" sandbox="allow-scripts allow-forms allow-same-origin allow-popups" referrerPolicy="no-referrer" />
          ) : (
            <div className="p-5">{body}</div>
          )}
        </Card>
      ))}
    </section>
  );
}

export function toSummary(doc: {
  id: string;
  type: DocumentSummary["type"];
  number: string;
  date: string;
  status: string;
  partyId: string;
  partyName: string;
  partyGstin: string;
  grandTotal: number;
  customFields: DocumentSummary["customFields"];
}): DocumentSummary {
  return { ...doc, total: doc.grandTotal / 100 };
}

/** Custom fields set by plugins + links from the document.actions filter. */
export async function PluginDocumentPanel({ ctx, doc }: { ctx: CompanyContext; doc: DocumentSummary }) {
  const fields = Object.entries(doc.customFields ?? {});
  const entries = await activeEntries(ctx.companyId);
  const links = entries.some((e) => e.manifest.filters.includes("document.actions"))
    ? await applyFilters({ companyId: ctx.companyId, user: ctx.user, role: ctx.role }, "document.actions", [] as LinkItem[], { document: doc })
    : [];
  if (!fields.length && !links.length) return null;
  return (
    <Card className="p-4 text-sm" data-testid="plugin-document-panel">
      {fields.length > 0 && (
        <dl className="grid grid-cols-2 gap-y-1.5">
          {fields.map(([k, f]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{f.label}</dt>
              <dd className="text-right font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {links.length > 0 && (
        <div className={cn("flex flex-col gap-1.5", fields.length > 0 && "mt-3 border-t border-border pt-3")}>
          {links.slice(0, 10).map((l, i) => (
            <PluginLink key={i} companyId={ctx.companyId} link={l} />
          ))}
        </div>
      )}
    </Card>
  );
}

export async function pluginReportLinks({ ctx }: { ctx: CompanyContext }) {
  const entries = await activeEntries(ctx.companyId);
  if (!entries.some((e) => e.manifest.filters.includes("reports.list"))) return [];
  return (await applyFilters({ companyId: ctx.companyId, user: ctx.user, role: ctx.role }, "reports.list", [] as LinkItem[], {})).slice(0, 20);
}

function PluginLink({ companyId, link }: { companyId: string; link: LinkItem }) {
  const href = companyHref(companyId, link.href);
  const external = href.startsWith("https://");
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
      {link.label} ↗
    </a>
  ) : (
    <Link href={href} className="font-medium text-primary hover:underline">
      {link.label}
    </Link>
  );
}
