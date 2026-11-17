import { PageHeader } from "@/components/ui";
import { SETTINGS_PERMISSIONS } from "@/lib/permissions";
import { requireCompanyPageAny } from "@/lib/tenant";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children, params }: LayoutProps<"/c/[companyId]/settings">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPageAny(companyId, SETTINGS_PERMISSIONS);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" />
      <SettingsTabs companyId={companyId} perms={[...ctx.permissions]} />
      {children}
    </div>
  );
}
