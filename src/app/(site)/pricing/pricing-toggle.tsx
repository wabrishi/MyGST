"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, cn } from "@/components/ui";
import { inr, planPrice, type BillingCycle, type Plan } from "@/lib/site";

/** Plan cards with a monthly / yearly switch. */
export function PricingCards({ plans }: { plans: Plan[] }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  return (
    <>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-border bg-surface p-1 shadow-xs">
          {(["monthly", "yearly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={cycle === c}
              onClick={() => setCycle(c)}
              className={cn("rounded-full px-5 py-2 text-sm font-medium transition-colors", cycle === c ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:text-foreground")}
            >
              {c === "monthly" ? "Monthly" : "Yearly"}
              {c === "yearly" && <span className={cn("ml-2 text-xs", cycle === c ? "text-primary-foreground/80" : "text-success")}>2 months free</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {plans.map((p) => {
          const price = planPrice(p, cycle);
          return (
            <section
              key={p.id}
              aria-label={`${p.name} plan`}
              className={cn("relative flex flex-col rounded-2xl border bg-surface p-7", p.highlight ? "border-primary shadow-lg ring-1 ring-primary/30 lg:-my-3 lg:py-10" : "border-border shadow-card")}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge color="blue">Most popular</Badge>
                </span>
              )}
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <p className="mt-1.5 min-h-10 text-sm text-muted">{p.tagline}</p>
              <div className="mt-6" data-testid={`price-${p.id}`}>
                {price === null ? (
                  <div className="text-4xl font-semibold tracking-tight">Custom</div>
                ) : price.perMonth === 0 ? (
                  <div className="text-4xl font-semibold tracking-tight">Free</div>
                ) : (
                  <>
                    <div className="tabular text-4xl font-semibold tracking-tight">
                      {inr(price.perMonth)}
                      <span className="text-base font-normal text-muted"> /month</span>
                    </div>
                    <div className="mt-1 text-xs text-muted">{cycle === "yearly" ? `${inr(price.billed)} billed yearly` : "billed monthly"} · plus GST</div>
                  </>
                )}
                {price?.perMonth === 0 && <div className="mt-1 text-xs text-muted">forever</div>}
                {price === null && <div className="mt-1 text-xs text-muted">tailored to your business</div>}
              </div>
              <Link
                href={p.cta.href}
                className={cn(
                  "mt-6 inline-flex h-11 items-center justify-center rounded-lg text-sm font-semibold",
                  p.highlight ? "bg-primary text-primary-foreground shadow-md hover:bg-primary-hover" : "border border-border bg-surface hover:border-border-strong hover:bg-subtle",
                )}
              >
                {p.cta.label}
              </Link>
              <ul className="mt-7 space-y-3 border-t border-border pt-6 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check size={17} className="mt-0.5 shrink-0 text-success" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
