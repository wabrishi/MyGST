import { KeyRound } from "lucide-react";
import { Badge, Card, CardHeader, Empty, Table, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/events/outbox";
import { requireCompanyPage } from "@/lib/tenant";
import { CreateKeyForm, RevokeKeyButton } from "./api-keys-client";

export const metadata = { title: "API keys" };

const fmt = (d: Date | null) => (d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—");

export default async function ApiKeysPage({ params }: PageProps<"/c/[companyId]/settings/api-keys">) {
  const { companyId } = await params;
  const ctx = await requireCompanyPage(companyId, "company.settings");
  const keys = await db.apiKey.findMany({ where: { companyId: ctx.companyId }, orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }] });
  const creators = new Map(
    (await db.user.findMany({ where: { id: { in: [...new Set(keys.map((k) => k.createdById))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="API keys"
          description={
            <>
              Let other suite apps (such as Lead Manager) create customers and quotations in this company through{" "}
              <code className="text-xs">{absoluteUrl("/api/v1")}</code>. A key acts with the permissions of the owner who created it.
            </>
          }
        />
        <div className="p-5">
          <CreateKeyForm companyId={ctx.companyId} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {keys.length === 0 ? (
          <Empty icon={KeyRound} title="No API keys yet">
            Create a key above and paste it into Lead Manager → Settings → Integrations.
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Key</Th>
                <Th>Created</Th>
                <Th>Last used</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className={k.revokedAt ? "text-muted" : ""}>
                  <Td className="font-medium">{k.name}</Td>
                  <Td className="font-mono text-xs">{k.prefix}…</Td>
                  <Td className="text-xs">
                    {fmt(k.createdAt)}
                    <div className="text-muted">by {creators.get(k.createdById) ?? "former member"}</div>
                  </Td>
                  <Td className="text-xs">{fmt(k.lastUsedAt)}</Td>
                  <Td>{k.revokedAt ? <Badge>Revoked</Badge> : <Badge color="green">Active</Badge>}</Td>
                  <Td className="text-right">{!k.revokedAt && <RevokeKeyButton companyId={ctx.companyId} id={k.id} name={k.name} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
