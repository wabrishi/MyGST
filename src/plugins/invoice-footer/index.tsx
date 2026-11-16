import { definePlugin } from "@/lib/plugins/sdk";

/**
 * Example plugin: prints a custom message (and optionally a UPI payment line) on every invoice PDF,
 * and shows this month's invoice count on the dashboard.
 * Shows: settings, the pdf.sections filter, a dashboard widget, ctx.data.
 */
export default definePlugin({
  manifest: {
    id: "invoice-footer",
    name: "Invoice footer",
    version: "1.0.0",
    description: "Adds your own message, such as a thank-you note or payment instructions, to the bottom of every invoice PDF.",
    author: "MyGST",
    icon: "FileText",
    permissions: ["documents:read", "company:read"],
    filters: ["pdf.sections"],
    settings: [
      { key: "message", label: "Footer message", type: "textarea", required: true, default: "Thank you for your business!", help: "Printed on invoices, credit notes and debit notes." },
      { key: "showUpi", label: "Add a UPI payment line (uses the UPI ID in company settings)", type: "boolean", default: false },
      { key: "onQuotations", label: "Also print on quotations", type: "boolean", default: false },
    ],
    widgets: [{ id: "this-month", title: "Invoices this month", roles: ["OWNER", "ACCOUNTANT"], width: "third" }],
  },
  setup(api) {
    api.filter("pdf.sections", async (sections, { document }, ctx) => {
      if (document.type === "QUOTATION" && !ctx.settings.onQuotations) return sections;
      const lines = String(ctx.settings.message ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (ctx.settings.showUpi && document.type === "INVOICE") {
        const company = await ctx.data.company();
        const upi = (await ctx.data.documents.get(document.id))?.seller as { upiId?: string } | undefined;
        if (upi?.upiId) lines.push(`Pay by UPI to ${upi.upiId} (${company.tradeName || company.legalName}).`);
      }
      return lines.length ? [...sections, { lines }] : sections;
    });

    api.widget("this-month", async ({ ctx }) => {
      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
      const invoices = await ctx.data.documents.list({ type: "INVOICE", from, limit: 200 });
      const issued = invoices.filter((d) => d.status !== "CANCELLED");
      const total = issued.reduce((a, d) => a + d.total, 0);
      return (
        <div>
          <div className="text-3xl font-semibold tabular-nums">{issued.length}</div>
          <div className="mt-1 text-sm text-muted">
            ₹{total.toLocaleString("en-IN", { maximumFractionDigits: 0 })} invoiced since {from}
          </div>
          <div className="mt-3 truncate text-xs text-muted" title={String(ctx.settings.message)}>
            Footer: “{String(ctx.settings.message).split("\n")[0]}”
          </div>
        </div>
      );
    });
  },
});
