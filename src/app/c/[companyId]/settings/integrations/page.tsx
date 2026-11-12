import { Badge, Card, CardHeader, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/events/outbox";
import { requireCompanyPage } from "@/lib/tenant";
import { WebhookForm, WebhookTools } from "./integrations-client";

export const metadata = { title: "Integrations" };

const STATUS: Record<string, ["green" | "amber" | "red" | "gray", string]> = {
  SENT: ["green", "Delivered"],
  PENDING: ["amber", "Retrying"],
  SENDING: ["amber", "Sending"],
  DEAD: ["red", "Failed"],
};

export default async function IntegrationsPage({ params }: PageProps<"/c/[companyId]/settings/integrations">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "company.settings");
  const [integration, events, dead] = await Promise.all([
    db.companyIntegration.findUnique({ where: { companyId: ctx.companyId }, select: { leadsWebhookUrl: true, enabled: true } }),
    db.outboxEvent.findMany({ where: { companyId: ctx.companyId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.outboxEvent.count({ where: { companyId: ctx.companyId, status: "DEAD" } }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Lead Manager"
          description="Send quotation, invoice and payment events to Lead Manager so they appear on the lead's timeline (and an issued invoice marks the lead as won)."
          actions={integration?.leadsWebhookUrl ? integration.enabled ? <Badge color="green">Connected</Badge> : <Badge>Paused</Badge> : <Badge>Not connected</Badge>}
        />
        <div className="flex flex-col gap-5 p-5">
          <WebhookForm companyId={ctx.companyId} url={integration?.leadsWebhookUrl ?? ""} enabled={integration?.enabled ?? true} />
          {integration?.leadsWebhookUrl && <WebhookTools companyId={ctx.companyId} deadCount={dead} />}
          <div className="rounded-lg border border-border bg-surface-2 p-4 text-[13px] text-muted">
            <p>
              Events: <code>quotation.created</code>, <code>quotation.converted</code>, <code>invoice.issued</code>, <code>invoice.cancelled</code>,{" "}
              <code>payment.received</code>. Each request is signed:{" "}
              <code>X-Suite-Signature: v1=HMAC-SHA256(secret, &quot;&lt;X-Suite-Timestamp&gt;.&lt;body&gt;&quot;)</code>. Failed deliveries retry after 1 m, 5 m,
              30 m, 2 h and 12 h.
            </p>
            <p className="mt-2">
              Dispatcher for the cron job (every minute): <code className="break-all">{absoluteUrl("/api/cron/tick")}</code> with{" "}
              <code>Authorization: Bearer CRON_SECRET</code>.
            </p>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Recent deliveries" description="Last 20 events" />
        {events.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No events yet. They appear once a webhook URL is saved and a quotation, invoice or payment is recorded.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Event</Th>
                <Th>Document</Th>
                <Th>Created</Th>
                <Th>Status</Th>
                <Th className="text-right">Attempts</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const data = (e.envelope as { data?: { number?: string } }).data ?? {};
                const [color, label] = STATUS[e.status] ?? ["gray", e.status];
                return (
                  <tr key={e.id}>
                    <Td className="font-mono text-xs">{e.type}</Td>
                    <Td className="text-xs">{data.number || "—"}</Td>
                    <Td className="whitespace-nowrap text-xs">{e.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</Td>
                    <Td>
                      <Badge color={color}>{label}</Badge>
                      {e.lastError && e.status !== "SENT" && <div className="mt-1 max-w-72 truncate text-xs text-danger" title={e.lastError}>{e.lastError}</div>}
                    </Td>
                    <Td className="text-right text-xs">{e.attempts}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
