import {
  ArrowRight,
  BarChart3,
  Blocks,
  Building2,
  CalendarCheck2,
  CloudUpload,
  Factory,
  FileText,
  GraduationCap,
  Lock,
  ReceiptIndianRupee,
  ScrollText,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { BRAND, FAQ, inr, PLANS, planPrice } from "@/lib/site";
import { CheckList, Container, CtaBand, Faq, FeatureCard, HeroBackdrop, SectionHeading } from "./ui";

export const metadata = {
  title: { absolute: `${BRAND} — GST billing, purchases & returns for Indian businesses` },
  description: "Create GST invoices, manage purchases and payments, and export GSTR-1 and GSTR-3B. Simple billing and accounting for Indian businesses, with your whole team.",
};

const FEATURES: Array<{ icon: LucideIcon; title: string; text: string; href: string }> = [
  { icon: FileText, title: "GST-ready invoices", text: "CGST + SGST or IGST picked from the place of supply, gap-free numbering, A4 PDF and email.", href: "/features#sales" },
  { icon: ScrollText, title: "Quotations & notes", text: "Turn a quotation into an invoice in one click. Credit and debit notes against the original.", href: "/features#sales" },
  { icon: ReceiptIndianRupee, title: "Payments & outstanding", text: "Record receipts, settle several invoices at once and see who owes what, by age.", href: "/features#payments" },
  { icon: ShoppingCart, title: "Purchases & ITC", text: "Purchase orders, supplier invoices against them, and the input tax credit you can claim.", href: "/features#purchases" },
  { icon: BarChart3, title: "GSTR-1 & GSTR-3B", text: "Return-ready summaries and CSV exports in the GST offline-tool format.", href: "/features#gst" },
  { icon: Users, title: "Team & roles", text: "Invite your accountant and staff. Decide exactly who can see and do what.", href: "/features#team" },
  { icon: CloudUpload, title: "Automatic backups", text: "Twice-daily backups to your own Google Drive, and a full export whenever you want.", href: "/features#security" },
  { icon: Blocks, title: "Apps & plugins", text: "Add a CRM, stock tracking and more, or build your own with the plugin SDK.", href: "/features#plugins" },
];

const AUDIENCE: Array<{ icon: LucideIcon; label: string }> = [
  { icon: Store, label: "Retail & shops" },
  { icon: Truck, label: "Traders & distributors" },
  { icon: Factory, label: "Manufacturers" },
  { icon: Building2, label: "Service businesses" },
  { icon: ShoppingBag, label: "Online sellers" },
  { icon: GraduationCap, label: "CAs & accountants" },
];

const STEPS = [
  ["Set up in minutes", "Add your GSTIN, address and bank details. The setup guide walks you through numbering and your team."],
  ["Add customers & products", "GSTIN checks and state auto-fill for parties; HSN/SAC and GST rates for products."],
  ["Bill, collect and file", "Create invoices, record payments and purchases, and export your GST returns."],
];

/** Static product preview (HTML, not a screenshot) shown in the hero. */
function ProductPreview() {
  const rows = [
    ["Laptop stand", "8473", "2", "1,800.00"],
    ["Wireless keyboard", "8471", "3", "2,850.00"],
    ["Installation service", "9987", "1", "1,000.00"],
  ];
  return (
    <div className="relative mx-auto w-full max-w-xl lg:mx-0" aria-label="Example invoice in MyGSTBook">
      <div aria-hidden className="absolute -inset-8 -z-10 rounded-[32px] bg-gradient-to-br from-primary/25 via-sky-400/10 to-transparent blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
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
              <th className="hidden px-2 py-2 text-left font-medium sm:table-cell">HSN</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th>
              <th className="px-5 py-2 text-right font-medium">Taxable</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([item, hsn, qty, amt]) => (
              <tr key={item} className="border-t border-border/70">
                <td className="px-5 py-2">{item}</td>
                <td className="hidden px-2 py-2 font-mono text-xs text-muted sm:table-cell">{hsn}</td>
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

      {/* Floating cards */}
      <div className="absolute -bottom-20 -left-4 hidden w-52 rounded-xl border border-border bg-surface/95 p-3.5 shadow-lg backdrop-blur sm:block lg:-left-10">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Receivables</div>
        <div className="tabular mt-1 text-lg font-semibold">₹1,24,500</div>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-subtle">
          <span className="w-[55%] bg-primary" />
          <span className="w-[25%] bg-sky-400" />
          <span className="w-[20%] bg-amber-400" />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-muted">
          <span>0–30</span>
          <span>31–60</span>
          <span>60+</span>
        </div>
      </div>
      <div className="absolute -right-3 -top-6 hidden rounded-xl border border-border bg-surface/95 px-3.5 py-2.5 shadow-lg backdrop-blur sm:block lg:-right-8">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-success-soft text-success">
            <CalendarCheck2 size={14} />
          </span>
          GSTR-1 ready to export
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const business = PLANS.find((p) => p.id === "business")!;
  const businessPrice = planPrice(business, "monthly");
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <HeroBackdrop />
        <Container className="relative grid items-center gap-16 pb-24 pt-14 sm:pb-32 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-36">
          <div>
            <Badge color="blue">Built for Indian GST</Badge>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
              Your business books, <span className="bg-gradient-to-r from-primary to-sky-500 bg-clip-text text-transparent">GST-ready every day.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              {BRAND} creates compliant invoices, tracks payments and purchases, and gets your GSTR-1 and GSTR-3B data ready, for every business you run and
              with your whole team.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-md hover:bg-primary-hover">
                Start free <ArrowRight size={17} />
              </Link>
              <Link href="/features" className="inline-flex h-12 items-center rounded-lg border border-border bg-surface px-6 text-[15px] font-semibold hover:border-border-strong hover:bg-subtle">
                See features
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              {["Free plan, no card needed", "Works on phone and computer", "Your data, always exportable"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-success" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <ProductPreview />
        </Container>
      </section>

      {/* Audience */}
      <section className="border-y border-border/70 bg-surface/60">
        <Container className="py-8">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-muted">Made for every kind of Indian business</p>
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {AUDIENCE.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground/75">
                <Icon size={17} className="text-primary" aria-hidden /> {label}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Features */}
      <section className="py-24">
        <Container>
          <SectionHeading eyebrow="Everything in one place" title="From the first quotation to the GST return">
            The everyday work of a GST-registered business, without spreadsheets or a pile of separate tools.
          </SectionHeading>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} icon={f.icon} title={f.title} href={f.href}>
                {f.text}
              </FeatureCard>
            ))}
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section className="border-y border-border/70 bg-surface py-24">
        <Container>
          <SectionHeading eyebrow="How it works" title="Up and running in an afternoon" />
          <ol className="mt-14 grid gap-6 md:grid-cols-3">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="relative rounded-2xl border border-border bg-background p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-md">{i + 1}</span>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Highlights */}
      <section className="py-24">
        <Container className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading center={false} eyebrow="Purchases & GST" title="Know your input tax credit before you file">
              Raise purchase orders, bill them in parts as goods arrive, and record supplier invoices with eligible, capital-goods or blocked ITC. GSTR-3B is
              worked out for you.
            </SectionHeading>
            <CheckList
              className="mt-6"
              items={["Purchase orders with numbered PDFs, sent to suppliers by email", "Partial billing: see what's ordered, billed and still to come", "B2B, B2CL, B2CS, CDNR and HSN summaries for GSTR-1"]}
            />
            <Link href="/features#purchases" className="mt-7 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Explore purchases <ArrowRight size={15} />
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted">GSTR-3B · this month</div>
                <div className="mt-1 text-lg font-semibold">Tax summary</div>
              </div>
              <Badge color="blue">Draft</Badge>
            </div>
            <dl className="tabular mt-5 divide-y divide-border text-sm">
              {[
                ["Output tax (sales)", "₹84,600"],
                ["Eligible ITC (purchases)", "− ₹51,240"],
                ["Blocked ITC", "₹3,120 not claimed"],
                ["Net tax payable", "₹33,360"],
              ].map(([k, v], i) => (
                <div key={k} className={`flex justify-between py-3 ${i === 3 ? "font-semibold" : ""}`}>
                  <dt className={i === 3 ? "" : "text-muted"}>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">Example figures.</p>
          </div>
        </Container>
      </section>

      {/* Security + plugins */}
      <section className="border-y border-border/70 bg-surface py-24">
        <Container className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-success-soft text-success">
              <Lock size={20} />
            </span>
            <h3 className="mt-5 text-xl font-semibold">Your data stays yours</h3>
            <CheckList
              className="mt-4"
              items={["Each company's books kept separate, with role-based access", "Close a financial year so filed figures can't change", "Twice-daily backups to your own Google Drive", "Export everything, any time"]}
            />
          </div>
          <div className="rounded-2xl border border-border bg-background p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Blocks size={20} />
            </span>
            <h3 className="mt-5 text-xl font-semibold">Grows with apps</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Switch on apps for the extra things your business needs. <b className="text-foreground">Lead Manager</b> tracks enquiries through your sales
              pipeline, follows up every morning and turns leads into customers and quotations.
            </p>
            <CheckList className="mt-4" items={["Apps appear in your sidebar and dashboard", "Each app's access is part of your team roles", "Developers can build custom apps"]} />
          </div>
        </Container>
      </section>

      {/* Pricing teaser */}
      <section className="py-24">
        <Container>
          <SectionHeading eyebrow="Pricing" title="Start free. Upgrade when you grow.">
            The Starter plan is free for one company. Business is {businessPrice ? inr(businessPrice.perMonth) : ""} a month for teams, purchases and backups.
          </SectionHeading>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {PLANS.map((p) => {
              const price = planPrice(p, "monthly");
              return (
                <div key={p.id} className={`rounded-2xl border bg-surface p-6 ${p.highlight ? "border-primary shadow-lg ring-1 ring-primary/30" : "border-border"}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{p.name}</h3>
                    {p.highlight && <Badge color="blue">Most popular</Badge>}
                  </div>
                  <div className="tabular mt-3 text-3xl font-semibold">
                    {price === null ? "Custom" : price.perMonth === 0 ? "Free" : inr(price.perMonth)}
                    {price && price.perMonth > 0 && <span className="text-base font-normal text-muted"> /month</span>}
                  </div>
                  <p className="mt-2 text-sm text-muted">{p.tagline}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-8 text-center">
            <Link href="/pricing" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Compare plans <ArrowRight size={15} />
            </Link>
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/70 bg-surface py-24">
        <Container>
          <SectionHeading eyebrow="Questions" title="Frequently asked questions" />
          <div className="mt-10">
            <Faq items={FAQ} />
          </div>
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
