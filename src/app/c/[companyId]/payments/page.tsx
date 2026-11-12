import { HandCoins } from "lucide-react";
import Link from "next/link";
import { DateRangeFilter } from "@/components/date-range";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/pager";
import { SearchBox } from "@/components/search-box";
import { Badge, ButtonLink, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isoOf } from "@/lib/documents";
import { formatINR, toPaise } from "@/lib/gst/calc";
import { selectedFyRange } from "@/lib/fy-context";
import { rangeFrom } from "@/lib/range";
import { requireCompanyPage } from "@/lib/tenant";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ params, searchParams }: PageProps<"/c/[companyId]/payments">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await requireCompanyPage(companyId, "payments.write");
  const fy = await selectedFyRange(ctx.companyId);
  const [from, to] = rangeFrom(sp, fy);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = pageFrom(sp);

  const where: Prisma.PaymentWhereInput = {
    companyId: ctx.companyId,
    date: { gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T00:00:00Z") },
    ...(q && { OR: [{ party: { name: { contains: q } } }, { reference: { contains: q } }] }),
  };
  const [rows, received, paid] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      include: { party: { select: { name: true } }, allocations: { select: { amount: true } } },
    }),
    db.payment.aggregate({ where: { ...where, direction: "RECEIVED" }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { ...where, direction: "PAID" }, _sum: { amount: true } }),
  ]);
  const base = `/c/${ctx.companyId}/payments`;

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle={`Received ${formatINR(toPaise(received._sum.amount?.toNumber() ?? 0))} · Paid ${formatINR(toPaise(paid._sum.amount?.toNumber() ?? 0))}`}
        actions={
          <>
            <ButtonLink variant="secondary" href={`${base}/new?direction=PAID`}>
              + Payment made
            </ButtonLink>
            <ButtonLink href={`${base}/new`}>+ Payment received</ButtonLink>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search party or reference" />
        <DateRangeFilter from={from} to={to} fy={fy} />
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty icon={HandCoins} title="No payments in this period">Record a payment received from a customer or paid to a supplier.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Party</Th>
                <Th>Type</Th>
                <Th>Mode</Th>
                <Th>Reference</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Unallocated</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE_SIZE).map((p) => {
                const amt = toPaise(p.amount.toNumber());
                const unalloc = amt - p.allocations.reduce((s, a) => s + toPaise(a.amount.toNumber()), 0);
                return (
                  <tr key={p.id} className="hover:bg-background">
                    <Td>
                      <Link href={`${base}/${p.id}`} className="text-primary hover:underline">
                        {isoOf(p.date)}
                      </Link>
                    </Td>
                    <Td>{p.party.name}</Td>
                    <Td>{p.direction === "RECEIVED" ? <Badge color="green">Received</Badge> : <Badge color="amber">Paid</Badge>}</Td>
                    <Td>{p.mode}</Td>
                    <Td>{p.reference}</Td>
                    <Td className="tabular text-right">{formatINR(amt)}</Td>
                    <Td className="tabular text-right">{unalloc ? formatINR(unalloc) : "—"}</Td>
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
