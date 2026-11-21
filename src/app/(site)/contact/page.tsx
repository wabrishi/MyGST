import { ArrowRight, Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { formToken } from "@/lib/contact";
import { CONTACT_TOPICS } from "@/lib/site";
import { getContactDetails } from "@/lib/site-store";
import { Container, PageHero } from "../ui";
import { ContactForm } from "./contact-form";

export const metadata = {
  title: "Contact us",
  description: "Questions about MyGSTBook, pricing or your account? Send us a message and we'll get back to you.",
};

export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  await connection(); // the form token carries the time the page was shown
  const sp = await searchParams;
  const topic = CONTACT_TOPICS.some((t) => t.value === sp.topic) ? String(sp.topic) : "sales";
  const c = await getContactDetails();
  const details = [
    c.phone && { icon: Phone, label: "Mobile", value: c.phone.label, href: c.phone.href },
    c.email && { icon: Mail, label: "Email", value: c.email, href: `mailto:${c.email}` },
    c.whatsapp && { icon: MessageCircle, label: "WhatsApp", value: "Chat with us", href: c.whatsapp },
    c.address && { icon: MapPin, label: "Office", value: c.address, href: null },
  ].filter(Boolean) as Array<{ icon: typeof Mail; label: string; value: string; href: string | null }>;

  return (
    <>
      <PageHero eyebrow="Contact" title="We'd love to hear from you">
        Questions about features or pricing, help with your account, or an idea for us? Send a message.
      </PageHero>

      <section className="py-16">
        <Container className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <ContactForm token={formToken()} topic={topic} />

          <aside className="flex flex-col gap-5">
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <h2 className="font-semibold">Other ways to reach us</h2>
              {details.length ? (
                <ul className="mt-4 space-y-4">
                  {details.map((d) => {
                    const Icon = d.icon;
                    return (
                      <li key={d.label} className="flex gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                          <Icon size={17} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs text-muted">{d.label}</span>
                          {d.href ? (
                            <a href={d.href} className="break-words text-sm font-medium hover:text-primary" {...(d.href.startsWith("http") && { target: "_blank", rel: "noreferrer" })}>
                              {d.value}
                            </a>
                          ) : (
                            <span className="block whitespace-pre-line text-sm font-medium">{d.value}</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">Use the form and we&apos;ll reply by email.</p>
              )}
              {details.length > 0 && (
                <p className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted">
                  <Clock size={14} /> We&apos;ll reply by email as soon as we can.
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <h2 className="font-semibold">Looking for something?</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {[
                  ["/pricing", "Compare plans and prices"],
                  ["/features", "See everything MyGSTBook does"],
                  ["/signup", "Create a free account"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                      {label} <ArrowRight size={14} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </Container>
      </section>
    </>
  );
}
