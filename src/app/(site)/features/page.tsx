import { BarChart3, Blocks, Building2, Code2, FileText, ReceiptIndianRupee, ShieldCheck, ShoppingCart, Users, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import { CheckList, Container, CtaBand, PageHero } from "../ui";

export const metadata = {
  title: "Features",
  description: "GST invoices, quotations, payments, purchase orders, ITC, GSTR-1 and GSTR-3B, team roles, backups and apps: everything MyGSTBook does.",
};

type Section = { id: string; icon: LucideIcon; nav: string; title: string; text: string; points: string[]; panel: ReactNode };

const Row = ({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) => (
  <div className={`flex items-center justify-between gap-3 py-2.5 text-sm ${strong ? "font-semibold" : ""}`}>
    <span className={strong ? "" : "text-muted"}>{k}</span>
    <span className="tabular text-right">{v}</span>
  </div>
);

const Panel = ({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) => (
  <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</span>
      {badge}
    </div>
    <div className="divide-y divide-border">{children}</div>
  </div>
);

const SECTIONS: Section[] = [
  {
    id: "sales",
    icon: FileText,
    nav: "Sales",
    title: "Sales & invoicing",
    text: "Invoices that are right the first time. MyGSTBook picks CGST + SGST/UTGST or IGST from the place of supply and works out every line.",
    points: [
      "Tax invoices, quotations, credit notes and debit notes",
      "Gap-free numbering per financial year, with your own prefixes",
      "Prices with or without tax, discounts and round-off",
      "Convert a quotation into an invoice in one click",
      "A4 PDF with your logo, bank details and amount in words; email it from the app",
    ],
    panel: (
      <Panel title="Invoice INV/26-27/0042" badge={<Badge color="green">Paid</Badge>}>
        <Row k="Place of supply" v="Karnataka (29) · IGST" />
        <Row k="Taxable value" v="₹42,000.00" />
        <Row k="IGST 18%" v="₹7,560.00" />
        <Row k="Total" v="₹49,560.00" strong />
      </Panel>
    ),
  },
  {
    id: "payments",
    icon: ReceiptIndianRupee,
    nav: "Payments",
    title: "Payments & outstanding",
    text: "Always know who owes you and whom you owe.",
    points: ["Record receipts and payments by cash, bank, UPI or cheque", "Settle several invoices with one payment", "Ageing: 0–30, 31–60, 61–90 and 90+ days", "Party ledgers with opening balances"],
    panel: (
      <Panel title="Receivables by age">
        <Row k="0–30 days" v="₹68,400" />
        <Row k="31–60 days" v="₹31,250" />
        <Row k="61–90 days" v="₹12,800" />
        <Row k="Over 90 days" v={<span className="text-danger">₹12,050</span>} />
      </Panel>
    ),
  },
  {
    id: "purchases",
    icon: ShoppingCart,
    nav: "Purchases",
    title: "Purchases, purchase orders & ITC",
    text: "Order from suppliers, bill as goods arrive, and claim the right input tax credit.",
    points: [
      "Purchase orders with numbered PDFs, emailed to suppliers",
      "Expected delivery dates and overdue orders",
      "Bill an order in parts; see ordered, billed and remaining quantities",
      "Supplier invoices with eligible, capital-goods or blocked ITC",
    ],
    panel: (
      <Panel title="PO/26-27/0007" badge={<Badge color="amber">Partly billed</Badge>}>
        <Row k="Steel rod · ordered" v="100 NOS" />
        <Row k="Billed so far" v="60 NOS" />
        <Row k="Still to come" v="40 NOS" strong />
      </Panel>
    ),
  },
  {
    id: "gst",
    icon: BarChart3,
    nav: "GST & reports",
    title: "GST returns & reports",
    text: "Return-ready figures without re-typing anything.",
    points: [
      "GSTR-1: B2B, B2CL, B2CS, CDNR, HSN summary and documents issued",
      "GSTR-3B summary with eligible and blocked ITC",
      "CSV exports in the GST offline-tool format",
      "Sales and purchase registers, party ledgers and outstanding reports",
    ],
    panel: (
      <Panel title="GSTR-1 · this month" badge={<Badge color="blue">Ready</Badge>}>
        <Row k="B2B invoices" v="38" />
        <Row k="B2C (small)" v="112" />
        <Row k="Credit notes" v="3" />
        <Row k="HSN codes" v="21" />
      </Panel>
    ),
  },
  {
    id: "companies",
    icon: Building2,
    nav: "Companies",
    title: "Companies & financial years",
    text: "Built around how Indian books work.",
    points: ["A guided setup for GSTIN, address, bank and numbering", "Switch between financial years in one click", "Close a year once returns are filed, so nothing changes later", "Separate books for each company"],
    panel: (
      <Panel title="Financial years">
        <Row k="FY 2026-27" v={<Badge color="green">Open</Badge>} />
        <Row k="FY 2025-26" v={<Badge>Closed</Badge>} />
        <Row k="FY 2024-25" v={<Badge>Closed</Badge>} />
      </Panel>
    ),
  },
  {
    id: "team",
    icon: Users,
    nav: "Team & roles",
    title: "Team & roles",
    text: "Bring in your accountant and staff, and decide exactly who does what.",
    points: [
      "Owner, Accountant and Staff roles ready to use",
      "Custom roles built from individual permissions",
      "Give one person several roles",
      "Invite by email; remove access in one click",
    ],
    panel: (
      <Panel title="Roles">
        <Row k="Asha · Owner" v="Everything" />
        <Row k="Ravi · Accountant" v="Billing, purchases, reports" />
        <Row k="Meena · Staff + Sales desk" v="Invoices, leads" />
      </Panel>
    ),
  },
  {
    id: "plugins",
    icon: Blocks,
    nav: "Apps",
    title: "Apps & plugins",
    text: "Switch on extra modules when you need them. Each app gets its own menu, dashboard card and team permissions.",
    points: [
      "Lead Manager: pipeline, follow-ups and a morning email; convert leads into customers and quotations",
      "Apps for notifications, custom fields on invoices and more",
      "Your administrator chooses which apps each company can use",
      "Developers can build their own apps with data tables, forms and scheduled jobs",
    ],
    panel: (
      <Panel title="Lead Manager · pipeline">
        <Row k="New" v="12 · ₹4.2L" />
        <Row k="Qualified" v="7 · ₹3.1L" />
        <Row k="Proposal" v="4 · ₹2.4L" />
        <Row k="Won this month" v={<span className="text-success">5 · ₹1.9L</span>} />
      </Panel>
    ),
  },
  {
    id: "security",
    icon: ShieldCheck,
    nav: "Security",
    title: "Security, backups & your data",
    text: "Your books are important. We treat them that way.",
    points: [
      "Every company's data kept separate; every action checked against roles",
      "Twice-daily backups to your own Google Drive, kept for 30 days",
      "Export all your data whenever you like",
      "An audit trail of important changes",
    ],
    panel: (
      <Panel title="Backups" badge={<Badge color="green">On</Badge>}>
        <Row k="Destination" v="Your Google Drive" />
        <Row k="Schedule" v="Twice a day" />
        <Row k="Kept for" v="30 days" />
      </Panel>
    ),
  },
  {
    id: "api",
    icon: Code2,
    nav: "API",
    title: "API & integrations",
    text: "Connect MyGSTBook to the rest of your tools.",
    points: ["A REST API to create customers and quotations", "Signed webhooks for invoices, payments and more", "API keys you can create and revoke", "External plugins that run on your own server"],
    panel: (
      <div className="overflow-hidden rounded-2xl border border-border bg-[#0f172a] p-5 font-mono text-[12.5px] leading-relaxed text-slate-200 shadow-card">
        <div className="text-slate-400"># Create a quotation</div>
        <div>
          <span className="text-sky-300">POST</span> /api/v1/quotations
        </div>
        <div className="text-slate-400">Authorization: Bearer mgk_…</div>
        <div className="mt-2">{"{ \"partyId\": \"…\", \"items\": [ … ] }"}</div>
      </div>
    ),
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero eyebrow="Features" title="Everything a GST business needs, in one book">
        Invoices, purchases, payments and returns, with your team, your data and the apps you choose.
      </PageHero>

      {/* In-page menu */}
      <nav aria-label="Feature sections" className="sticky top-16 z-30 border-b border-border/60 bg-background/85 backdrop-blur-lg">
        <Container className="flex gap-1 overflow-x-auto py-2.5 [scrollbar-width:none]">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium text-foreground/70 hover:bg-subtle hover:text-foreground">
              {s.nav}
            </a>
          ))}
        </Container>
      </nav>

      <Container className="py-8">
        {SECTIONS.map((s, i) => {
          const Icon = s.icon;
          return (
            <section key={s.id} id={s.id} className="grid scroll-mt-32 items-center gap-10 border-b border-border/60 py-16 last:border-0 lg:grid-cols-2 lg:gap-16">
              <div className={i % 2 ? "lg:order-2" : undefined}>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary ring-1 ring-primary/10">
                  <Icon size={22} />
                </span>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{s.title}</h2>
                <p className="mt-3 text-base leading-relaxed text-muted">{s.text}</p>
                <CheckList className="mt-6" items={s.points} />
              </div>
              <div className={i % 2 ? "lg:order-1" : undefined}>{s.panel}</div>
            </section>
          );
        })}
        <p className="pb-4 text-center text-xs text-muted">Numbers shown in the examples are illustrative.</p>
      </Container>

      <CtaBand title="See it with your own business" />
    </>
  );
}
