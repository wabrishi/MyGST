import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { DateRangeFilter } from "@/components/date-range";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/pager";
import { SearchBox } from "@/components/search-box";
import { ButtonLink, Card, Empty, FilterPills, PageHeader, Table, Td, Th } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isoOf } from "@/lib/documents";
import { selectedFyRange } from "@/lib/fy-context";
import { formatINR, toPaise } from "@/lib/gst/calc";
import { todayIST } from "@/lib/gst/fy";
import { can } from "@/lib/permissions";
import { billedPercent, isOverdue, type PoStatus } from "@/lib/po-status";
import { rangeFrom } from "@/lib/range";
import { requireCompanyPage } from "@/lib/tenant";
import { PoStatusBadge } from "./po-badge";

export const metadata = { title: "Purchase orders" };

const FILTERS = [
  ["", "All"],
  ["open", "Open"],
  ["overdue", "Overdue"],
  ["BILLED", "Billed"],
  ["CLOSED", "Closed"],
  ["CANCELLED", "Cancelled"],
] as const;

export default async function PurchaseOrdersPage({ params, searchParams }: PageProps<"/c/[companyId]/purchase-orders">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await requireCompanyPage(companyId, "purchaseOrders.view");
  const fy = await selectedFyRange(ctx.companyId);
  const [from, to] = rangeFrom(sp, fy);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = pageFrom(sp);
  const today = todayIST();
  const openStatuses: PoStatus[] = ["OPEN", "PARTIAL"];

  const where: Prisma.PurchaseOrderWhereInput = {
    companyId: ctx.companyId,
    date: { gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T00:00:00Z") },
    ...(q && { OR: [{ number: { contains: q } }, { partyName: { contains: q } }, { partyGstin: { contains: q } }] }),
    ...(status === "open" && { status: { in: openStatuses } }),
    ...(status === "overdue" && { status: { in: openStatuses }, expectedDate: { lt: new Date(today + "T00:00:00Z") } }),
    ...(["BILLED", "CLOSED", "CANCELLED"].includes(status) && { status: status as PoStatus }),
  };
  const [rows, openSum] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      orderBy: [{ date: "desc" }, { seq: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      include: { items: { select: { qty: true, billedQty: true } } },
    }),
    db.purchaseOrder.aggregate({ where: { companyId: ctx.companyId, status: { in: openStatuses } }, _sum: { grandTotal: true }, _count: true }),
  ]);
  const base = `/c/${ctx.companyId}/purchase-orders`;
  const pill = (v: string) => {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) if (typeof val === "string" && k !== "status" && k !== "page") p.set(k, val);
    if (v) p.set("status", v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <>
      <PageHeader
        title="Purchase orders"
        subtitle={`${openSum._count} open · ${formatINR(toPaise(openSum._sum.grandTotal?.toNumber() ?? 0))} still to be billed or received`}
        actions={can(ctx, "purchaseOrders.write") && <ButtonLink href={`${base}/new`}>+ New purchase order</ButtonLink>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search PO no., supplier, GSTIN" />
        <FilterPills active={status} items={FILTERS.map(([v, l]) => ({ value: v, label: l, href: pill(v) }))} />
        <DateRangeFilter from={from} to={to} fy={fy} />
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty icon={ClipboardList} title="No purchase orders here">
            Raise a purchase order, send it to your supplier, then bill it with purchase invoices as goods arrive.
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>PO no.</Th>
                <Th>Date</Th>
                <Th>Supplier</Th>
                <Th>Deliver by</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Billed</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE_SIZE).map((po) => {
                const lines = po.items.map((i) => ({ qty: i.qty.toNumber(), billedQty: i.billedQty.toNumber() }));
                const expected = isoOf(po.expectedDate);
                return (
                  <tr key={po.id} className={po.status === "CANCELLED" ? "text-muted line-through" : undefined}>
                    <Td>
                      <Link href={`${base}/${po.id}`} className="font-medium text-primary hover:underline">
                        {po.number}
                      </Link>
                    </Td>
                    <Td>{isoOf(po.date)}</Td>
                    <Td>{po.partyName}</Td>
                    <Td>{expected || "—"}</Td>
                    <Td className="tabular text-right">{formatINR(toPaise(po.grandTotal.toNumber()))}</Td>
                    <Td className="tabular text-right">{billedPercent(lines)}%</Td>
                    <Td>
                      <PoStatusBadge status={po.status} overdue={isOverdue(po.status, expected || null, today)} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pager page={page} hasMore={rows.length > PAGE_SIZE} basePath={base} searchParams={sp} />
      </Card>
    </>
  );
}
