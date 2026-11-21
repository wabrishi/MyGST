import { ArrowRight, Check, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";

/** Building blocks shared by the public website's pages. */

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{children}</p>;
}

export function SectionHeading({ eyebrow, title, children, center = true }: { eyebrow?: string; title: ReactNode; children?: ReactNode; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{children}</p>}
    </div>
  );
}

/** Page title band used at the top of inner pages. */
export function PageHero({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <HeroBackdrop />
      <Container className="relative py-16 text-center sm:py-24">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h1>
        {children && <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">{children}</p>}
      </Container>
    </section>
  );
}

/** Soft indigo glow with a faint grid, behind hero sections. */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(700px circle at 15% -10%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 60%), radial-gradient(600px circle at 95% 10%, rgb(56 189 248 / 0.16), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.35] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        style={{
          backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
    </div>
  );
}

export function FeatureCard({ icon: Icon, title, children, href }: { icon: LucideIcon; title: string; children: ReactNode; href?: string }) {
  const body = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary ring-1 ring-primary/10">
        <Icon size={20} />
      </span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
      {href && (
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
          Learn more <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </>
  );
  const cls = "group block rounded-2xl border border-border bg-surface p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function CheckList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-sm leading-relaxed">
          <Check size={17} className="mt-0.5 shrink-0 text-success" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** Big closing call to action. */
export function CtaBand({ title = "Start billing the right way today", text = "Create your account in a minute. No card needed." }: { title?: string; text?: string }) {
  return (
    <section className="py-20">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-[#1e1b4b] px-6 py-14 text-center text-white sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{ background: "radial-gradient(500px circle at 10% 0%, rgb(99 102 241 / 0.6), transparent 60%), radial-gradient(500px circle at 100% 100%, rgb(56 189 248 / 0.3), transparent 60%)" }}
          />
          <h2 className="relative text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-indigo-100/80">{text}</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-[#1e1b4b] hover:bg-indigo-50">
              Start free <ArrowRight size={16} />
            </Link>
            <Link href="/contact?topic=sales" className="inline-flex h-11 items-center rounded-lg px-5 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/10">
              Talk to us
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

export function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-border rounded-2xl border border-border bg-surface">
      {items.map((f) => (
        <details key={f.q} className="group px-5 py-4 sm:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
            {f.q}
            <span aria-hidden className="text-xl leading-none text-muted transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
