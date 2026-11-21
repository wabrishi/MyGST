import { Check, Minus } from "lucide-react";
import { COMPARISON, PLANS } from "@/lib/site";
import { Container, CtaBand, Faq, PageHero, SectionHeading } from "../ui";
import { PricingCards } from "./pricing-toggle";

export const metadata = {
  title: "Pricing",
  description: "Simple pricing for GST billing: a free Starter plan, Business for growing teams, and Enterprise for custom needs.",
};

const PRICING_FAQ = [
  { q: "Is the Starter plan really free?", a: "Yes, for one company and up to two users, with no time limit and no card needed." },
  { q: "Do prices include GST?", a: "No. Prices are shown before GST; 18% GST is added to your bill." },
  { q: "Can I change plans later?", a: "Yes. Move up or down at any time; your data stays exactly where it is." },
  { q: "How does yearly billing work?", a: "Pay for ten months and get twelve: the yearly price includes two months free." },
  { q: "Do you help us move from another software?", a: "Yes. Enterprise includes help with moving your customers, products and opening balances. Contact us and we'll plan it with you." },
];

function Cell({ v }: { v: boolean | string }) {
  if (v === true) return <Check size={18} className="mx-auto text-success" aria-label="Included" />;
  if (v === false) return <Minus size={18} className="mx-auto text-muted/60" aria-label="Not included" />;
  return <span className="text-sm">{v}</span>;
}

export default function PricingPage() {
  return (
    <>
      <PageHero eyebrow="Pricing" title="Simple pricing that grows with you">
        Start free and upgrade when your team and business grow. No setup fees, cancel any time.
      </PageHero>

      <section className="py-16">
        <Container>
          <PricingCards plans={PLANS} />
          <p className="mt-8 text-center text-xs text-muted">Prices are in Indian rupees and exclude 18% GST.</p>
        </Container>
      </section>

      <section className="border-y border-border/70 bg-surface py-20">
        <Container>
          <SectionHeading eyebrow="Compare" title="Every plan, side by side" />
          <div className="mt-10 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] text-left">
              <thead className="bg-surface-2">
                <tr>
                  <th className="px-5 py-4 text-sm font-semibold">Feature</th>
                  {PLANS.map((p) => (
                    <th key={p.id} className={`px-5 py-4 text-center text-sm font-semibold ${p.highlight ? "text-primary" : ""}`}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              {COMPARISON.map((g) => (
                <tbody key={g.group}>
                  <tr className="border-t border-border bg-background">
                    <th colSpan={4} className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
                      {g.group}
                    </th>
                  </tr>
                  {g.rows.map(([label, ...values]) => (
                    <tr key={label} className="border-t border-border">
                      <td className="px-5 py-3 text-sm">{label}</td>
                      {values.map((v, i) => (
                        <td key={i} className="px-5 py-3 text-center">
                          <Cell v={v} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container>
          <SectionHeading eyebrow="Questions" title="Pricing questions" />
          <div className="mt-10">
            <Faq items={PRICING_FAQ} />
          </div>
        </Container>
      </section>

      <CtaBand title="Try MyGSTBook free today" />
    </>
  );
}
