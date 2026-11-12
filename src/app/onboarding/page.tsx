import { CenteredShell } from "@/components/centered-shell";
import { CompanyForm } from "@/components/company-form";
import { Alert, ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hubMode, hubUrl } from "@/lib/hub-rules";
import { userCompany } from "@/lib/one-company";
import { createCompany } from "./actions";

export const metadata = { title: "Set up your business" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const existing = await userCompany(user.id);

  // One company per user: people who already belong to a company can't create another.
  if (existing) {
    return (
      <CenteredShell>
        <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">You already have a company</h1>
        <Alert kind="info">
          You belong to <b>{existing.tradeName || existing.legalName}</b>. Each user can be part of only one company — to run another
          business, sign up with a different email address.
        </Alert>
        <ButtonLink href={`/c/${existing.id}/dashboard`} className="self-start">
          Go to {existing.tradeName || existing.legalName}
        </ButtonLink>
        </div>
      </CenteredShell>
    );
  }

  // Hub mode: companies come from the suite Hub (workspace + GST subscription), never created here.
  if (hubMode()) {
    const notice = (await db.user.findUnique({ where: { id: user.id }, select: { hubNotice: true } }))?.hubNotice;
    return (
      <CenteredShell>
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">No MyGST company yet</h1>
          <Alert kind="info">
            {notice ??
              "Your suite workspace doesn't have MyGST access for this account yet. Ask your workspace owner to add you, or start GST Invoicing from your account."}
          </Alert>
          <ButtonLink href={`${hubUrl()}/home`} className="self-start">
            Open your suite account
          </ButtonLink>
        </div>
      </CenteredShell>
    );
  }

  return (
    <CenteredShell width="lg">
      <p className="text-sm font-medium text-primary">Step 1 of 2 · Create your company</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Welcome, {user.name.split(" ")[0]}</h1>
      <p className="mb-6 mt-1 text-muted">
        Tell us about your business. You can change these details later in Settings. If you were invited to an existing company, open the
        invitation link from your email instead.
      </p>
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <CompanyForm action={createCompany} submitLabel="Create company" />
      </div>
    </CenteredShell>
  );
}
