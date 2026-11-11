import { redirect } from "next/navigation";

export default async function SettingsIndex({ params }: PageProps<"/c/[companyId]/settings">) {
  const { companyId } = await params;
  redirect(`/c/${companyId}/settings/company`);
}
