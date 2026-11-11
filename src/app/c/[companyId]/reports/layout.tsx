import { requireCompanyPage } from "@/lib/tenant";

export default async function ReportsLayout({ children, params }: LayoutProps<"/c/[companyId]/reports">) {
  const { companyId } = await params;
  await requireCompanyPage(companyId, "reports.view");
  return children;
}
