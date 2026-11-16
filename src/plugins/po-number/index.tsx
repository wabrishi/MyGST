import { PluginError, definePlugin } from "@/lib/plugins/sdk";

/**
 * Example plugin: customer purchase-order numbers.
 * Type "PO: 4500012345" in a document's notes; the plugin stores it as a custom field, prints it on the
 * PDF, can require it for registered (GSTIN) customers, and lists documents by PO on its own page.
 * Shows: document.validate, document.beforeSave, custom fields, a page in the sidebar, a document action link.
 */
// "PO: 123", "PO#123", "P.O. No. 123", "PO number - 123"
const PO = /\bP\.?\s?O\.?\s*(?:(?:no\.?|number|#)\s*[:#-]?|[:#-])\s*([A-Z0-9][A-Z0-9/_-]{1,39})/i;
export const findPo = (notes: string | null | undefined) => (notes ?? "").match(PO)?.[1]?.toUpperCase() ?? null;

export default definePlugin({
  manifest: {
    id: "po-number",
    name: "Customer PO number",
    version: "1.0.0",
    description: "Records the customer's purchase order number on invoices (write \"PO: 12345\" in the notes), prints it on the PDF and lists documents by PO.",
    author: "MyGST",
    icon: "ClipboardList",
    permissions: ["documents:read"],
    filters: ["document.validate", "document.beforeSave", "document.actions"],
    settings: [
      {
        key: "requireFor",
        label: "Require a PO number on invoices for",
        type: "select",
        required: true,
        default: "none",
        options: [
          { value: "none", label: "Nobody (optional)" },
          { value: "registered", label: "Registered customers (with GSTIN)" },
          { value: "all", label: "All customers" },
        ],
      },
    ],
    pages: [{ slug: "register", title: "PO register", icon: "ClipboardList", roles: ["OWNER", "ACCOUNTANT", "STAFF"], inNav: true }],
  },
  setup(api) {
    api.filter("document.validate", (_v, { type, input, party }, ctx) => {
      if (type !== "INVOICE") return;
      const rule = ctx.settings.requireFor;
      const required = rule === "all" || (rule === "registered" && !!party.gstin);
      if (required && !findPo(input.notes)) throw new PluginError(`Add ${party.name}'s purchase order number in Notes, like "PO: 4500012345".`);
    });

    api.filter("document.beforeSave", (value, { input }) => {
      const po = findPo(input.notes);
      const customFields = { ...value.customFields };
      if (po) customFields["po-number.po"] = { label: "Customer PO", value: po, onPdf: true };
      else delete customFields["po-number.po"];
      return { ...value, customFields };
    });

    api.filter("document.actions", (links, { document }) =>
      document.customFields["po-number.po"] ? [...links, { label: "Other documents with this PO", href: `apps/po-number/register?po=${encodeURIComponent(document.customFields["po-number.po"].value)}` }] : links,
    );

    api.page("register", async ({ ctx, searchParams }) => {
      const filter = typeof searchParams.po === "string" ? searchParams.po.toUpperCase() : "";
      const docs = (await ctx.data.documents.list({ limit: 200 })).filter((d) => d.customFields["po-number.po"] && (!filter || d.customFields["po-number.po"].value === filter));
      return (
        <div className="rounded-xl border border-border bg-surface shadow-card">
          {filter && <div className="border-b border-border px-5 py-3 text-sm">Showing PO <b>{filter}</b></div>}
          {docs.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">No documents with a PO number yet. Write &quot;PO: 12345&quot; in an invoice&apos;s notes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2">PO</th>
                  <th className="px-5 py-2">Document</th>
                  <th className="px-5 py-2">Customer</th>
                  <th className="px-5 py-2">Date</th>
                  <th className="px-5 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-5 py-2 font-mono">{d.customFields["po-number.po"].value}</td>
                    <td className="px-5 py-2">
                      <a className="text-primary hover:underline" href={ctx.appUrl(`/c/${ctx.companyId}/${d.type === "INVOICE" ? "invoices" : d.type === "QUOTATION" ? "quotations" : d.type === "CREDIT_NOTE" ? "credit-notes" : "debit-notes"}/${d.id}`)}>
                        {d.number}
                      </a>
                    </td>
                    <td className="px-5 py-2">{d.partyName}</td>
                    <td className="px-5 py-2">{d.date}</td>
                    <td className="px-5 py-2 text-right tabular-nums">₹{d.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      );
    });
  },
});
