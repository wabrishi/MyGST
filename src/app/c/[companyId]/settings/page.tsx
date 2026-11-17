import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { requireCompanyPageAny } from "@/lib/tenant";
import { SETTINGS_PERMISSIONS } from "@/lib/permissions";
import { SETTINGS_TABS } from "./tab-list";

/** Opens the first settings tab this member may use. */
export default async function SettingsIndex({ params }: PageProps<"/c/[companyId]/settings">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPageAny(companyId, SETTINGS_PERMISSIONS);
  const first = SETTINGS_TABS.find(([slug, , perm]) => !slug.startsWith("/") && can(ctx, perm));
  redirect(`/c/${ctx.companyId}/settings/${first?.[0] ?? "company"}`);
}
