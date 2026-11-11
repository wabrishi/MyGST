import { Card, PageHeader } from "@/components/ui";
import { requireCompanyPage } from "@/lib/tenant";
import { PartyForm } from "../party-form";

export const metadata = { title: "New party" };

export default async function NewPartyPage({ params }: PageProps<"/c/[companyId]/parties/new">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "masters.write");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New party" />
      <Card className="p-5">
        <PartyForm companyId={ctx.companyId} id={null} initial={{ stateCode: ctx.company.stateCode }} />
      </Card>
    </div>
  );
}
