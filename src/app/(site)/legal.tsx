import Link from "next/link";
import type { ReactNode } from "react";
import { getContactDetails } from "@/lib/site-store";
import { Container, PageHero } from "./ui";

/** Shared layout for the privacy policy and terms of service. */
export function LegalPage({ eyebrow, title, updated, intro, children }: { eyebrow: string; title: string; updated: string; intro: ReactNode; children: ReactNode }) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title}>
        Last updated {updated}
      </PageHero>
      <section className="py-16">
        <Container className="max-w-3xl">
          <div className="text-base leading-relaxed text-foreground/85 [&_a]:font-medium [&_a]:text-primary hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-1.5 [&_p]:mt-4 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
            <div className="text-lg text-muted">{intro}</div>
            {children}
          </div>
        </Container>
      </section>
    </>
  );
}

/** How to reach us, from Admin → Website (falls back to the contact form). */
export async function ContactLine() {
  const c = await getContactDetails();
  return (
    <p>
      {c.email ? (
        <>
          Email us at <a href={`mailto:${c.email}`}>{c.email}</a> or use our <Link href="/contact">contact form</Link>.
        </>
      ) : (
        <>
          Write to us through our <Link href="/contact">contact form</Link>.
        </>
      )}
      {c.address && <> Our address: {c.address}.</>}
    </p>
  );
}
