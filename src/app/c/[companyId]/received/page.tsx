import { Inbox } from "lucide-react";
import Link from "next/link";
import { Badge, Card, Empty, FilterPills, PageHeader, Table, Td, Th } from "@/components/ui";
import type { Prisma, SharedKind } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst/calc";
import { KIND_LABEL } from "@/lib/sharing";
import { requireCompany } from "@/lib/tenant";
import { STATUS_BADGE, visibleKinds } from "./access";

export const metadata = { title: "Received" };

const FILTERS = [
  ["", "To review"],
  ["ACCEPTED", "In your books"],
  ["REJECTED", "Rejected"],
  ["all", "All"],
] as const;

/** Documents other companies on MyGSTBook addressed to this company. */
export default async function ReceivedPage({ params, searchParams }: PageProps<"/c/[companyId]/received">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await requireCompany(companyId);
  const kinds = visibleKinds(ctx);
  const status = typeof sp.status === "string" ? sp.status : "";
  const kind = typeof sp.kind === "string" && (kinds as string[]).includes(sp.kind) ? (sp.kind as SharedKind) : null;
  const where: Prisma.SharedDocumentWhereInput = {
    toCompanyId: ctx.companyId,
    kind: kind ? kind : { in: kinds },
    ...(status === "" && { status: "NEW" }),
    ...((status === "ACCEPTED" || status === "REJECTED") && { status }),
  };
  const rows = kinds.length ? await db.sharedDocument.findMany({ where, orderBy: { receivedAt: "desc" }, take: 200, include: { fromCompany: { select: { legalName: true, tradeName: true } } } }) : [];
  const base = `/c/${ctx.companyId}/received`;
  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(status && { status }), ...(kind && { kind }), ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <>
      <PageHeader title="Received" subtitle="Invoices, notes, quotations and purchase orders other businesses on MyGSTBook sent you. Nothing enters your books until you add it." />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <FilterPills active={status} items={FILTERS.map(([v, l]) => ({ value: v, label: l, href: href({ status: v }) }))} />
        <FilterPills
          active={kind ?? ""}
          items={[{ value: "", label: "All types", href: href({ kind: "" }) }, ...kinds.map((k) => ({ value: k, label: KIND_LABEL[k], href: href({ kind: k }) }))]}
        />
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty icon={Inbox} title={status === "" ? "Nothing to review" : "Nothing here"}>
            When a supplier or customer on MyGSTBook sends you a document addressed to your GSTIN, it appears here.
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>From</Th>
                <Th>Document</Th>
                <Th>Date</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.status === "NEW" && !r.readAt ? "font-semibold" : undefined}>
                  <Td>{r.fromCompany.tradeName || r.fromCompany.legalName}</Td>
                  <Td>
                    <Link href={`${base}/${r.id}`} className="text-primary hover:underline">
                      {KIND_LABEL[r.kind]} {r.number}
                    </Link>
                    {r.updatedBySender && r.status !== "WITHDRAWN" && <span className="ml-2 text-xs font-normal text-warning">changed by sender</span>}
                  </Td>
                  <Td className="whitespace-nowrap">{r.date.toISOString().slice(0, 10)}</Td>
                  <Td className="tabular text-right">{formatINR(toPaise(r.total.toNumber()))}</Td>
                  <Td>
                    <Badge color={STATUS_BADGE[r.status].color}>{STATUS_BADGE[r.status].label}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
