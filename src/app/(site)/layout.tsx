import { Mail, Phone } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { getSessionUser } from "@/lib/auth";
import { BRAND, SITE_NAV, TAGLINE } from "@/lib/site";
import { getContactDetails } from "@/lib/site-store";
import { SiteNav } from "./site-nav";

/** The public website: header, page, footer. Signed-in visitors get an "Open app" button. */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [user, contact] = await Promise.all([getSessionUser().catch(() => null), getContactDetails()]);
  const signedIn = !!user;
  const year = new Date().getFullYear();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-lg">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-lg">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          {contact.phone && (
            <a href={contact.phone.href} className="ml-auto hidden items-center gap-1.5 text-sm font-medium text-foreground/70 hover:text-primary lg:inline-flex" aria-label={`Call us on ${contact.phone.label}`}>
              <Phone size={15} /> {contact.phone.label}
            </a>
          )}
          <SiteNav signedIn={signedIn} />
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border bg-surface">
        <div className={`mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 ${contact.phone || contact.email ? "md:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr]" : "md:grid-cols-[1.4fr_1fr_1fr_1fr]"}`}>
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">{TAGLINE}. Invoices, purchases, payments and GST returns in one place.</p>
          </div>
          <FooterCol
            title="Product"
            links={[
              ["/features", "Features"],
              ["/pricing", "Pricing"],
              ["/features#plugins", "Apps & plugins"],
              ["/features#security", "Security & backups"],
            ]}
          />
          <FooterCol title="Company" links={SITE_NAV.filter((l) => l.href === "/about" || l.href === "/contact").map((l) => [l.href, l.label])} />
          <FooterCol
            title="Get started"
            links={[
              ["/signup", "Create an account"],
              ["/login", "Sign in"],
              ["/contact?topic=sales", "Talk to sales"],
            ]}
          />
          {(contact.phone || contact.email) && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Talk to us</h2>
              <ul className="mt-3 space-y-2.5 text-sm">
                {contact.phone && (
                  <li>
                    <a href={contact.phone.href} className="inline-flex items-center gap-2 text-foreground/80 hover:text-primary">
                      <Phone size={14} /> {contact.phone.label}
                    </a>
                  </li>
                )}
                {contact.email && (
                  <li>
                    <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-2 break-all text-foreground/80 hover:text-primary">
                      <Mail size={14} /> {contact.email}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span>
              © {year} {BRAND}. All rights reserved.
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link href="/privacy" className="hover:text-primary">
                Privacy policy
              </Link>
              <Link href="/terms" className="hover:text-primary">
                Terms of service
              </Link>
              <span>Made in India for Indian businesses</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<readonly [string, string]> }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <ul className="mt-3 space-y-2.5 text-sm">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-foreground/80 hover:text-primary">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
