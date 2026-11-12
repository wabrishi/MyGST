import Link from "next/link";
import { CenteredShell } from "@/components/centered-shell";
import { redirect } from "next/navigation";
import { Alert, Badge, ButtonLink, Card } from "@/components/ui";
import { isSuperAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/permissions";
import { listUserCompanies } from "@/lib/tenant";

export const metadata = { title: "Your companies" };

export default async function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  const user = await requireUser();
  const sp = await searchParams;
  const admin = isSuperAdmin(user);
  const companies = await listUserCompanies(user.id);
  const active = companies.filter((m) => !m.company.suspendedAt);

  // Fast paths for the common cases (not for admins or when showing a notice).
  if (!admin && !sp.suspended) {
    if (companies.length === 0) redirect("/onboarding");
    if (companies.length === 1 && active.length === 1) redirect(`/c/${active[0].company.id}/dashboard`);
  }

  return (
    <CenteredShell>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your company</h1>
      {sp.suspended && (
        <div className="mb-4">
          <Alert kind="warning">That company is suspended. Contact support to reactivate it.</Alert>
        </div>
      )}
      {admin && (
        <Card className="mb-4 flex items-center justify-between p-4">
          <span>You are a platform super-admin.</span>
          <ButtonLink href="/admin">Open admin panel</ButtonLink>
        </Card>
      )}
      {companies.length > 0 ? (
        <Card className="divide-y divide-border">
          {companies.map(({ company, role }) =>
            company.suspendedAt ? (
              <div key={company.id} className="flex items-center justify-between px-4 py-3 text-muted">
                <span>{company.tradeName || company.legalName}</span>
                <Badge color="red">Suspended</Badge>
              </div>
            ) : (
              <Link key={company.id} href={`/c/${company.id}/dashboard`} className="flex items-center justify-between px-4 py-3 hover:bg-background">
                <span className="font-medium">{company.tradeName || company.legalName}</span>
                <span className="text-xs text-muted">{ROLE_LABEL[role]}</span>
              </Link>
            ),
          )}
        </Card>
      ) : (
        <p className="text-muted">You don&apos;t belong to any company yet.</p>
      )}
      {companies.length === 0 && (
        <ButtonLink href="/onboarding" variant="secondary" className="mt-4">
          + Create your company
        </ButtonLink>
      )}
    </CenteredShell>
  );
}
