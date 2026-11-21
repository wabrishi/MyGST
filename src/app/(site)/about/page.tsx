import { Blocks, Calculator, HeartHandshake, Lock, Sparkles, Target } from "lucide-react";
import { BRAND } from "@/lib/site";
import { CheckList, Container, CtaBand, FeatureCard, PageHero, SectionHeading } from "../ui";

export const metadata = {
  title: "About us",
  description: `Why we built ${BRAND}: GST billing and accounting that's simple, accurate and yours, made in India for Indian businesses.`,
};

const VALUES = [
  { icon: Calculator, title: "Accurate GST, always", text: "Tax is worked out by one tested engine, from the place of supply down to the last paisa of round-off." },
  { icon: Lock, title: "Your data is yours", text: "Your books stay separate and private. Back them up to your own Google Drive and export everything whenever you like." },
  { icon: Sparkles, title: "Simple by default", text: "Clear screens and words a shopkeeper and a CA both understand. Power is there when you need it, out of the way when you don't." },
  { icon: Blocks, title: "Open to grow", text: "Apps, an API and webhooks mean MyGSTBook fits the way your business works, not the other way round." },
];

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="About us" title="Making GST simple for every Indian business">
        {BRAND} is billing and accounting software built in India, for the millions of businesses that live with GST every day.
      </PageHero>

      <section className="py-20">
        <Container className="grid items-start gap-14 lg:grid-cols-2">
          <div>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Target size={20} />
            </span>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight">Why we built it</h2>
            <div className="mt-4 space-y-4 text-base leading-relaxed text-muted">
              <p>
                Running a GST-registered business means invoices that must be exactly right, purchases whose tax credit you need to track, and returns
                every month. Too often that work is spread across spreadsheets, notebooks and software that feels built for accountants only.
              </p>
              <p>
                We built {BRAND} to put the whole book in one place: quotations, invoices, purchases, payments and GST returns, shared safely with your
                accountant and team, and easy enough to use from a phone at the counter.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-8 shadow-card">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-success-soft text-success">
              <HeartHandshake size={20} />
            </span>
            <h2 className="mt-5 text-xl font-semibold">What you can count on</h2>
            <CheckList
              className="mt-4"
              items={[
                "GST rules handled for you: CGST/SGST or IGST, HSN summaries, return exports",
                "Your financial years closed and protected once returns are filed",
                "Backups you control, and a full export at any time",
                "Clear roles so everyone sees only what they should",
                "A product that keeps improving, with your feedback",
              ]}
            />
          </div>
        </Container>
      </section>

      <section className="border-y border-border/70 bg-surface py-20">
        <Container>
          <SectionHeading eyebrow="What we believe" title="Four promises behind every screen" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v) => (
              <FeatureCard key={v.title} icon={v.icon} title={v.title}>
                {v.text}
              </FeatureCard>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container className="max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Built with you</h2>
          <p className="mt-4 text-base leading-relaxed text-muted">
            The best features come from the businesses that use {BRAND} every day. Tell us what would make your work easier: we read every message.
          </p>
        </Container>
      </section>

      <CtaBand title="Join the businesses keeping their books GST-ready" text="Start free, or tell us about your business and we'll help you get set up." />
    </>
  );
}
