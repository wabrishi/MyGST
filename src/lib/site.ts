/**
 * The public website's content in one place: brand, navigation, pricing plans and FAQ.
 * Edit prices and plan features here. Pure module (safe in client components).
 */

export const BRAND = "MyGSTBook";
export const TAGLINE = "GST billing & accounting for Indian businesses";

export const SITE_NAV = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

// ───────────────────────── Pricing ─────────────────────────

export type BillingCycle = "monthly" | "yearly";

export interface Plan {
  id: "starter" | "business" | "enterprise";
  name: string;
  tagline: string;
  /** Rupees per month, billed monthly; null = "Contact us". */
  monthly: number | null;
  /** Months charged when paying yearly (10 = "2 months free"). */
  yearlyMonths: number;
  highlight?: boolean;
  cta: { label: string; href: string };
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For freelancers and new businesses getting started with GST.",
    monthly: 0,
    yearlyMonths: 12,
    cta: { label: "Start free", href: "/signup" },
    features: ["1 company, up to 2 users", "GST invoices, quotations, credit & debit notes", "A4 PDF and email invoices", "Payments and outstanding", "GSTR-1 and GSTR-3B exports", "Data export any time"],
  },
  {
    id: "business",
    name: "Business",
    tagline: "For growing businesses with a team and purchases to manage.",
    monthly: 499,
    yearlyMonths: 10,
    highlight: true,
    cta: { label: "Get started", href: "/signup" },
    features: [
      "Everything in Starter",
      "Up to 10 users with custom roles",
      "Purchase orders and purchase invoices with ITC",
      "Sales, purchase, ledger and ageing reports",
      "Automatic Google Drive backups",
      "Apps such as Lead Manager",
      "Email support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For groups, CAs and businesses with custom needs.",
    monthly: null,
    yearlyMonths: 12,
    cta: { label: "Talk to us", href: "/contact?topic=sales" },
    features: ["Everything in Business", "Several companies and unlimited users", "Custom plugins and integrations", "API and webhooks", "Priority support and onboarding", "Data migration help"],
  },
];

/** Price shown for a plan: per month, and the total billed for the cycle. null = "Contact us". */
export function planPrice(plan: Pick<Plan, "monthly" | "yearlyMonths">, cycle: BillingCycle) {
  if (plan.monthly === null) return null;
  if (cycle === "monthly") return { perMonth: plan.monthly, billed: plan.monthly };
  const billed = plan.monthly * plan.yearlyMonths;
  return { perMonth: Math.round(billed / 12), billed };
}

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Rows of the comparison table: [feature, starter, business, enterprise]; true/false or text. */
export const COMPARISON: Array<{ group: string; rows: Array<[string, boolean | string, boolean | string, boolean | string]> }> = [
  {
    group: "Billing",
    rows: [
      ["GST invoices (CGST/SGST or IGST)", true, true, true],
      ["Quotations, credit and debit notes", true, true, true],
      ["Gap-free numbering per financial year", true, true, true],
      ["PDF and email invoices", true, true, true],
      ["Payments, receipts and ageing", true, true, true],
    ],
  },
  {
    group: "Purchases & GST",
    rows: [
      ["GSTR-1 and GSTR-3B exports", true, true, true],
      ["Purchase invoices with ITC", false, true, true],
      ["Purchase orders with partial billing", false, true, true],
      ["Ledger, sales and purchase registers", false, true, true],
    ],
  },
  {
    group: "Team & control",
    rows: [
      ["Companies", "1", "1", "Several"],
      ["Users", "2", "10", "Unlimited"],
      ["Custom roles and permissions", false, true, true],
      ["Financial-year lock", true, true, true],
    ],
  },
  {
    group: "Data & extensions",
    rows: [
      ["Data export", true, true, true],
      ["Automatic Google Drive backups", false, true, true],
      ["Apps (plugins) such as Lead Manager", false, true, true],
      ["API, webhooks and custom plugins", false, false, true],
      ["Support", "Help docs", "Email", "Priority"],
    ],
  },
];

export const FAQ: Array<{ q: string; a: string }> = [
  { q: "Is MyGSTBook made for Indian GST?", a: "Yes. It picks CGST + SGST/UTGST or IGST from the place of supply, numbers invoices without gaps per financial year, and exports GSTR-1 and GSTR-3B data in the GST offline-tool format." },
  { q: "Can I try it for free?", a: "Yes. The Starter plan is free, and you can start using Business features straight away. No card is needed to sign up." },
  { q: "Can my accountant and staff use it?", a: "Invite them by email. Give each person a role such as Owner, Accountant or Staff, or build your own roles with exactly the permissions they need." },
  { q: "Is my data safe?", a: "Each company's data is kept separate, access is controlled by roles, closed financial years can't be changed, and backups can go to your own Google Drive twice a day. You can export everything at any time." },
  { q: "Does it work on my phone?", a: "Yes. MyGSTBook runs in the browser on phones, tablets and computers. There's nothing to install." },
  { q: "Can MyGSTBook be extended?", a: "Yes. Apps (plugins) add features such as Lead Manager, and developers can build their own with the plugin SDK, data tables and API." },
];

export const CONTACT_TOPICS = [
  { value: "sales", label: "Sales and pricing" },
  { value: "support", label: "Help with my account" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Something else" },
] as const;
