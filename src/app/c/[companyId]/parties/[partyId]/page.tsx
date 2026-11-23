import { notFound } from "next/navigation";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { partyNetworkStatus } from "@/lib/network";
import { can } from "@/lib/permissions";
import { requireCompany } from "@/lib/tenant";
import { PartyForm } from "../party-form";

export const metadata = { title: "Edit party" };

export default async function EditPartyPage({ params }: PageProps<"/c/[companyId]/parties/[partyId]">) {
  const { companyId, partyId } = await params;
  const ctx = await requireCompany(companyId);
  const p = await db.party.findFirst({ where: { id: partyId, companyId: ctx.companyId } });
  if (!p) notFound();
  const [status, { inviteParties }] = await Promise.all([
    partyNetworkStatus({ gstin: p.gstin, email: p.email }, ctx.companyId),
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { inviteParties: true } }),
  ]);
  const note =
    status.kind === "on-portal"
      ? `On MyGSTBook ✓${status.name ? ` as ${status.name}: documents you send them arrive in their books` : ""}`
      : status.kind === "invited"
        ? status.joinedAt
          ? `Joined MyGSTBook on ${status.joinedAt.toISOString().slice(0, 10)}`
          : `Invited to MyGSTBook on ${status.sentAt.toISOString().slice(0, 10)}`
        : null;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={p.name}
        subtitle={p.active ? undefined : "Inactive"}
        actions={
          can(ctx, "reports.view") && (
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
          canDelete={can(ctx, "masters.delete")}
          invite={{ defaultChecked: inviteParties && !p.email, note }}
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
