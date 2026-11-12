import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { DateRangeFilter } from "@/components/date-range";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/pager";
import { SearchBox } from "@/components/search-box";
import { StatusBadge } from "@/components/status-badge";
import { ButtonLink, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isoOf, paymentStatus } from "@/lib/documents";
import { formatINR, toPaise } from "@/lib/gst/calc";
import { can } from "@/lib/permissions";
import { selectedFyRange } from "@/lib/fy-context";
import { rangeFrom } from "@/lib/range";
import { requireCompanyPage } from "@/lib/tenant";

export const metadata = { title: "Purchases" };

export default async function PurchasesPage({ params, searchParams }: PageProps<"/c/[companyId]/purchases">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await requireCompanyPage(companyId, "purchases.view");
  const fy = await selectedFyRange(ctx.companyId);
  const [from, to] = rangeFrom(sp, fy);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = pageFrom(sp);
  const where: Prisma.PurchaseBillWhereInput = {
    companyId: ctx.companyId,
    billDate: { gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T00:00:00Z") },
    ...(q && { OR: [{ billNumber: { contains: q } }, { partyName: { contains: q } }, { partyGstin: { contains: q } }] }),
  };
  const [rows, sums] = await Promise.all([
    db.purchaseBill.findMany({
      where,
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      include: { allocations: { select: { amount: true } } },
    }),
    db.purchaseBill.aggregate({ where: { ...where, cancelled: false }, _sum: { grandTotal: true, cgst: true, sgst: true, igst: true } }),
  ]);
  const itc = toPaise((sums._sum.cgst?.toNumber() ?? 0) + (sums._sum.sgst?.toNumber() ?? 0) + (sums._sum.igst?.toNumber() ?? 0));
  const base = `/c/${ctx.companyId}/purchases`;

  return (
    <>
      <PageHeader
        title="Purchases"
        subtitle={`${formatINR(toPaise(sums._sum.grandTotal?.toNumber() ?? 0))} purchases · ${formatINR(itc)} GST paid`}
        actions={can(ctx.role, "purchases.write") && <ButtonLink href={`${base}/new`}>+ New purchase bill</ButtonLink>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search bill no., supplier, GSTIN" />
        <DateRangeFilter from={from} to={to} fy={fy} />
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty icon={ShoppingCart} title="No purchase bills in this period">Record supplier bills to track payables and input tax credit.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Bill no.</Th>
                <Th>Date</Th>
                <Th>Supplier</Th>
                <Th className="text-right">Taxable</Th>
                <Th className="text-right">GST</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE_SIZE).map((b) => {
                const grand = toPaise(b.grandTotal.toNumber());
                const paid = b.allocations.reduce((s, a) => s + toPaise(a.amount.toNumber()), 0);
                const tax = toPaise(b.cgst.toNumber() + b.sgst.toNumber() + b.igst.toNumber());
                return (
                  <tr key={b.id} className={b.cancelled ? "text-muted line-through" : "hover:bg-background"}>
                    <Td>
                      <Link href={`${base}/${b.id}`} className="font-medium text-primary hover:underline">
                        {b.billNumber}
                      </Link>
                    </Td>
                    <Td>{isoOf(b.billDate)}</Td>
                    <Td>{b.partyName}</Td>
                    <Td className="tabular text-right">{formatINR(toPaise(b.taxableTotal.toNumber()))}</Td>
                    <Td className="tabular text-right">{formatINR(tax)}</Td>
                    <Td className="tabular text-right">{formatINR(grand)}</Td>
                    <Td>
                      <StatusBadge
                        status={b.cancelled ? "CANCELLED" : paymentStatus({ grandTotal: grand, balance: grand - paid, dueDate: isoOf(b.dueDate) })}
                      />
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
