import { Check } from "lucide-react";
import Link from "next/link";
import { Alert, ButtonLink, Card, PageHeader, cn } from "@/components/ui";
import { db } from "@/lib/db";
import { financialYear, todayIST } from "@/lib/gst/fy";
import { DEFAULT_PREFIX, DOC_LABEL } from "@/lib/numbering";
import { ROLE_LABEL } from "@/lib/permissions";
import { SETUP_STEPS, setupStatus } from "@/lib/setup";
import { requireCompanyPage } from "@/lib/tenant";
import { LogoForm } from "../settings/company/logo-form";
import { NumberingForm } from "../settings/numbering/numbering-form";
import { InviteForm } from "../settings/users/users-client";
import { CompanyStep, FinishButton } from "./setup-client";

export const metadata = { title: "Company setup" };

export default async function SetupPage({ params, searchParams }: PageProps<"/c/[companyId]/setup">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await requireCompanyPage(companyId, "company.settings");
  const status = await setupStatus(ctx.companyId);
  const firstOpen = status.steps.find((s) => !s.done)?.step ?? 5;
  const step = Math.min(5, Math.max(1, Number(sp.step) || firstOpen));
  const base = `/c/${ctx.companyId}/setup`;
  const next = `${base}?step=${step + 1}`;

  const c = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, omit: { logo: true } });
  const initial = {
    legalName: c.legalName,
    tradeName: c.tradeName,
    gstin: c.gstin,
    address: c.address,
    city: c.city,
    pincode: c.pincode,
    stateCode: c.stateCode,
    phone: c.phone,
    email: c.email,
    bankName: c.bankName,
    bankAccount: c.bankAccount,
    bankIfsc: c.bankIfsc,
    bankBranch: c.bankBranch,
    upiId: c.upiId,
    terms: c.terms ?? "",
    pricesIncludeTax: c.pricesIncludeTax,
  };

  let body: React.ReactNode;
  if (step === 1) {
    body = <CompanyStep companyId={ctx.companyId} sections={["business"]} initial={initial} nextHref={next} />;
  } else if (step === 2) {
    const full = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { logo: true, logoMime: true } });
    const logo = full.logo ? `data:${full.logoMime};base64,${Buffer.from(full.logo).toString("base64")}` : null;
    body = (
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="mb-2 font-semibold">Logo (optional)</h3>
          <LogoForm companyId={ctx.companyId} logo={logo} />
        </div>
        <CompanyStep companyId={ctx.companyId} sections={["bank", "defaults"]} initial={initial} nextHref={next} />
      </div>
    );
  } else if (step === 3) {
    const fy = financialYear(todayIST());
    const series = await db.numberSeries.findMany({ where: { companyId: ctx.companyId }, orderBy: { fy: "desc" } });
    const rows = (Object.keys(DEFAULT_PREFIX) as Array<keyof typeof DEFAULT_PREFIX>).map((t) => {
      const cur = series.find((s) => s.docType === t && s.fy === fy) ?? series.find((s) => s.docType === t);
      return { type: t, label: DOC_LABEL[t], prefix: cur?.prefix ?? DEFAULT_PREFIX[t], nextSeq: series.find((s) => s.docType === t && s.fy === fy)?.nextSeq ?? 1 };
    });
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-muted">
          Your books follow the Indian financial year (1 April – 31 March); the current year is <b>FY 20{fy}</b>. Numbers restart at 0001 every
          April. Choose the prefixes printed before each number — up to 6 characters, e.g. <code>INV/</code> → <code>INV/{fy}/0001</code>.
          Migrating mid-year? Enter customer/supplier opening balances on each party; older years can be closed later in Settings → Financial
          years.
        </p>
        <NumberingForm companyId={ctx.companyId} fy={fy} rows={rows} />
      </div>
    );
  } else if (step === 4) {
    const members = await db.membership.findMany({
      where: { companyId: ctx.companyId },
      include: { user: { select: { name: true, email: true } } },
    });
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-muted">
          <b>Accountant</b>: billing, payments, purchases and reports. <b>Staff</b>: create invoices and quotations only. <b>Owner</b>: full
          control including settings. You can skip this step.
        </p>
        <InviteForm companyId={ctx.companyId} />
        <ul className="text-sm">
          {members.map((m) => (
            <li key={m.id}>
              {m.user.name} · {m.user.email} · <span className="text-muted">{ROLE_LABEL[m.role]}</span>
            </li>
          ))}
          {status.counts.invites > 0 && <li className="text-muted">{status.counts.invites} pending invitation(s)</li>}
        </ul>
      </div>
    );
  } else {
    const cBase = `/c/${ctx.companyId}`;
    body = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <div className="text-2xl font-semibold">{status.counts.parties}</div>
            <div className="text-muted">customers / suppliers</div>
            <ButtonLink variant="secondary" className="mt-3" href={`${cBase}/parties/new`}>
              + Add party
            </ButtonLink>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-semibold">{status.counts.products}</div>
            <div className="text-muted">products / services</div>
            <ButtonLink variant="secondary" className="mt-3" href={`${cBase}/products/new`}>
              + Add product
            </ButtonLink>
          </Card>
        </div>
        <FinishButton companyId={ctx.companyId} ready={status.completed === status.total} />
      </div>
    );
  }

  const current = SETUP_STEPS[step - 1];
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Set up your company"
        subtitle={`${status.completed} of ${status.total} steps complete`}
        actions={
          <ButtonLink variant="ghost" href={`/c/${ctx.companyId}/dashboard`}>
            {status.finished ? "Back to dashboard" : "Skip for now"}
          </ButtonLink>
        }
      />
      {status.finished && (
        <div className="mb-4">
          <Alert kind="success">Setup is complete. You can revisit any step to make changes.</Alert>
        </div>
      )}
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
        <div className="h-full bg-primary transition-all" style={{ width: `${status.percent}%` }} />
      </div>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <nav aria-label="Setup steps">
          <ol className="flex flex-col gap-1">
            {status.steps.map((s) => (
              <li key={s.key}>
                <Link
                  href={`${base}?step=${s.step}`}
                  aria-current={s.step === step ? "step" : undefined}
                  className={cn(
                    "flex items-start gap-2 rounded-md px-2 py-2",
                    s.step === step ? "bg-primary/10 text-primary" : "hover:bg-black/5",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                      s.done ? "border-success bg-success text-white" : "border-border bg-surface",
                    )}
                  >
                    {s.done ? <Check size={12} aria-label="done" /> : s.step}
                  </span>
                  <span>
                    <span className="block font-medium">{s.title}</span>
                    <span className="block text-xs text-muted">{s.desc}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <Card className="p-5">
          <h2 className="mb-1 text-lg font-semibold">
            Step {step}: {current.title}
          </h2>
          <p className="mb-4 text-xs text-muted">{current.desc}</p>
          {body}
          {step >= 3 && step < 5 && (
            <div className="mt-6 flex justify-between border-t border-border pt-4">
              <ButtonLink variant="ghost" href={`${base}?step=${step - 1}`}>
                ← Back
              </ButtonLink>
              <ButtonLink href={next}>Next →</ButtonLink>
            </div>
          )}
          {step === 2 && (
            <div className="mt-4">
              <ButtonLink variant="ghost" href={`${base}?step=1`}>
                ← Back
              </ButtonLink>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
