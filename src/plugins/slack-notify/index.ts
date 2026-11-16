import { definePlugin, type PluginContext } from "@/lib/plugins/sdk";

/**
 * Example plugin: posts a message to a Slack channel (incoming webhook) when an invoice is issued or a
 * payment is received. Shows: action hooks, a secret setting, ctx.http, idempotency via ctx.storage.
 */
async function post(ctx: PluginContext, eventId: string, text: string) {
  const url = String(ctx.settings.webhookUrl ?? "");
  if (!url) return ctx.log.warn("No Slack webhook URL set; skipping");
  // Events can be delivered more than once: remember what was already posted.
  if (await ctx.storage.get(`sent:${eventId}`)) return;
  const res = await ctx.http.fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`Slack answered HTTP ${res.status}`); // thrown errors are retried with backoff
  await ctx.storage.set(`sent:${eventId}`, Date.now());
}

const inr = (n: unknown) => `₹${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default definePlugin({
  manifest: {
    id: "slack-notify",
    name: "Slack notifications",
    version: "1.0.0",
    description: "Posts to a Slack channel when an invoice is issued or a payment arrives.",
    author: "MyGST",
    icon: "MessageSquare",
    permissions: ["documents:read", "payments:read"],
    events: ["invoice.issued", "payment.received"],
    settings: [
      { key: "webhookUrl", label: "Slack incoming webhook URL", type: "secret", required: true, help: "Slack → Apps → Incoming Webhooks → Add to a channel → copy the URL." },
      { key: "payments", label: "Also notify payments received", type: "boolean", default: true },
    ],
  },
  setup(api) {
    api.on("invoice.issued", async (event, ctx) => {
      const d = event.data as { number?: string; total?: number; url?: string; partyId?: string };
      await post(ctx, event.id, `🧾 Invoice *${d.number}* issued for ${inr(d.total)} — ${ctx.company.tradeName || ctx.company.legalName}\n${d.url ?? ""}`);
    });
    api.on("payment.received", async (event, ctx) => {
      if (!ctx.settings.payments) return;
      const d = event.data as { amount?: number; number?: string; url?: string };
      await post(ctx, event.id, `💰 Payment of ${inr(d.amount)} received${d.number ? ` (ref ${d.number})` : ""}\n${d.url ?? ""}`);
    });
  },
});
