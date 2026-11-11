import { notFound } from "next/navigation";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCompany } from "@/lib/tenant";
import { PartyForm } from "../party-form";

export const metadata = { title: "Edit party" };

export default async function EditPartyPage({ params }: PageProps<"/c/[companyId]/parties/[partyId]">) {
  const { companyId, partyId } = await params;
  const ctx = await requireCompany(companyId);
  const p = await db.party.findFirst({ where: { id: partyId, companyId: ctx.companyId } });
  if (!p) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={p.name}
        subtitle={p.active ? undefined : "Inactive"}
        actions={
          can(ctx.role, "reports.view") && (
            <ButtonLink variant="secondary" href={`/c/${ctx.companyId}/reports/ledger?party=${p.id}`}>
              View ledger
            </ButtonLink>
          )
        }
      />
      <Card className="p-5">
        <PartyForm
          companyId={ctx.companyId}
          id={p.id}
          canDelete={can(ctx.role, "masters.delete")}
          initial={{
            type: p.type,
            name: p.name,
            gstin: p.gstin,
            phone: p.phone,
            email: p.email,
            billingAddress: p.billingAddress,
            shippingAddress: p.shippingAddress,
            stateCode: p.stateCode,
            shippingState: p.shippingState ?? "",
            openingBalance: p.openingBalance.toNumber(),
            creditDays: p.creditDays,
          }}
        />
      </Card>
    </div>
  );
}
