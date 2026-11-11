import { CompanyForm } from "@/components/company-form";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { requireCompanyPage } from "@/lib/tenant";
import { updateCompany } from "../actions";
import { LogoForm } from "./logo-form";

export const metadata = { title: "Company settings" };

export default async function CompanySettingsPage({ params }: PageProps<"/c/[companyId]/settings/company">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "company.settings");
  const c = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
  const logo = c.logo ? `data:${c.logoMime};base64,${Buffer.from(c.logo).toString("base64")}` : null;

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <LogoForm companyId={ctx.companyId} logo={logo} />
      </Card>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-semibold">Backup</h2>
          <p className="text-xs text-muted">Automatic Google Drive backups (twice daily) and a one-click JSON export.</p>
        </div>
        <a href={`/c/${ctx.companyId}/settings/backup`} className="text-sm font-medium text-primary hover:underline">
          Backup settings →
        </a>
      </Card>
      <Card className="p-5">
        <CompanyForm
          action={updateCompany.bind(null, ctx.companyId)}
          submitLabel="Save changes"
          initial={{
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
          }}
        />
      </Card>
    </div>
  );
}
