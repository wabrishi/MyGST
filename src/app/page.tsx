import {
  ArrowRight,
  BarChart3,
  CalendarCheck2,
  CloudUpload,
  FileText,
  ReceiptIndianRupee,
  ScrollText,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { Badge, ButtonLink } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";

const FEATURES: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: FileText, title: "GST-compliant invoices", text: "CGST + SGST/UTGST or IGST chosen from the place of supply. Gap-free numbering per financial year, A4 PDF and email." },
  { icon: ScrollText, title: "Quotations & notes", text: "Convert quotations into invoices in one click. Issue credit and debit notes against the original invoice." },
  { icon: ReceiptIndianRupee, title: "Payments & outstanding", text: "Record receipts, allocate them across invoices and track ageing — 0–30, 31–60, 61–90 and 90+ days." },
  { icon: ShoppingCart, title: "Purchases & ITC", text: "Capture supplier bills with eligible, capital-goods or blocked input tax credit and reverse charge." },
  { icon: BarChart3, title: "GSTR-1 & GSTR-3B", text: "B2B, B2CL, B2CS, CDNR, HSN summary and documents issued, exported in the offline-tool CSV format." },
  { icon: CalendarCheck2, title: "Financial-year control", text: "Switch between years in one click and close a year once returns are filed so nothing changes later." },
  { icon: Users, title: "Team roles", text: "Invite your accountant and staff as Owner, Accountant or Staff with the right level of access." },
  { icon: CloudUpload, title: "Automatic backups", text: "Twice-daily backups to your own Google Drive, kept for 30 days, plus one-click data export." },
];

const STEPS = [
  ["Set up your business", "Add your GSTIN, address and bank details with the guided setup."],
  ["Add customers & products", "Save parties with GSTIN validation and products with HSN/SAC and GST rate."],
  ["Bill and file", "Create invoices, collect payments and export your GST returns."],
];

/** Static product preview (HTML, not a screenshot) shown in the hero. */
function InvoicePreview() {
  const rows = [
    ["Laptop stand", "8473", "2", "1,800.00"],
    ["Wireless keyboard", "8471", "3", "2,850.00"],
    ["Installation service", "9987", "1", "1,000.00"],
  ];
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-6 -z-10 rounded-[28px] bg-gradient-to-br from-primary/25 via-sky-400/10 to-transparent blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-modal">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Tax invoice</div>
            <div className="font-semibold">INV/26-27/0042</div>
          </div>
          <Badge color="green">Paid</Badge>
        </div>
        <div className="grid grid-cols-2 gap-4 px-5 py-4 text-[13px]">
          <div>
            <div className="text-xs text-muted">Bill to</div>
            <div className="font-medium">Sharma Electronics</div>
            <div className="font-mono text-[11px] text-muted">27ABCDE1234F1Z5</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted">Place of supply</div>
            <div className="font-medium">Maharashtra (27)</div>
            <div className="text-[11px] text-muted">Intra-state · CGST + SGST</div>
          </div>
        </div>
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-2 text-left font-medium">Item</th>
              <th className="px-2 py-2 text-left font-medium">HSN</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th>
              <th className="px-5 py-2 text-right font-medium">Taxable</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([item, hsn, qty, amt]) => (
              <tr key={item} className="border-t border-border/70">
                <td className="px-5 py-2">{item}</td>
                <td className="px-2 py-2 font-mono text-xs text-muted">{hsn}</td>
                <td className="tabular px-2 py-2 text-right">{qty}</td>
                <td className="tabular px-5 py-2 text-right">₹{amt}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tabular grid grid-cols-2 gap-y-1 border-t border-border bg-surface-2 px-5 py-3.5 text-[13px]">
          <span className="text-muted">Taxable value</span>
          <span className="text-right">₹5,650.00</span>
          <span className="text-muted">CGST 9% + SGST 9%</span>
          <span className="text-right">₹1,017.00</span>
          <span className="pt-1 font-semibold">Total</span>
          <span className="pt-1 text-right text-base font-semibold">₹6,667.00</span>
        </div>
      </div>
    </div>
  );
}

export default async function Home() {
  if (await getSessionUser()) redirect("/companies");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <nav className="flex items-center gap-2">
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-foreground sm:inline">
              Features
            </a>
            <ButtonLink href="/login" variant="ghost">
              Sign in
            </ButtonLink>
            <ButtonLink href="/signup">Get started</ButtonLink>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-16 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div>
            <Badge color="blue">Built for Indian GST</Badge>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              GST billing, done right — <span className="text-primary">from invoice to return.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Create compliant invoices, track payments and purchases, and export GSTR-1 and GSTR-3B data — for every business you run, with your whole
              team.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/signup" size="lg">
                Start free <ArrowRight size={16} />
              </ButtonLink>
              <ButtonLink href="/login" size="lg" variant="secondary">
                Sign in
              </ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              {["CGST · SGST · IGST · UTGST", "GSTIN validation", "Multi-user roles"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <InvoicePreview />
        </section>

        {/* Features */}
        <section id="features" className="border-y border-border bg-surface py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight">Everything a GST-registered business needs</h2>
              <p className="mt-3 text-muted">From the first quotation to the monthly return — without spreadsheets.</p>
            </div>
            <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div key={title}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Icon size={19} />
                  </div>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Up and running in three steps</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-24">
          <div className="relative overflow-hidden rounded-3xl bg-[#1e1b4b] px-8 py-14 text-center text-white sm:px-16">
            <div
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{ background: "radial-gradient(500px circle at 20% 0%, rgb(99 102 241 / 0.6), transparent 60%), radial-gradient(400px circle at 85% 100%, rgb(56 189 248 / 0.3), transparent 60%)" }}
            />
            <div className="relative">
              <h2 className="text-3xl font-semibold tracking-tight">Ready to send your first GST invoice?</h2>
              <p className="mx-auto mt-3 max-w-xl text-indigo-100/80">Set up your company in a few minutes. Invite your accountant when you&apos;re ready.</p>
              <ButtonLink href="/signup" size="lg" className="mt-8 bg-white text-[#1e1b4b] hover:bg-indigo-50">
                Create your account <ArrowRight size={16} />
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted">
          <Logo />
          <span>© {new Date().getFullYear()} MyGST · GST billing for Indian businesses</span>
        </div>
      </footer>
    </div>
  );
}
