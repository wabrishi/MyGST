import { PageHeader } from "@/components/ui";
import { requireCompanyPage } from "@/lib/tenant";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children, params }: LayoutProps<"/c/[companyId]/settings">) {
  const { companyId } = await params;
  await requireCompanyPage(companyId, "company.settings");
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" />
      <SettingsTabs companyId={companyId} />
      {children}
    </div>
  );
}
