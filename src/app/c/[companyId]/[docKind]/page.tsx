import { FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateRangeFilter } from "@/components/date-range";
import { selectedFyRange } from "@/lib/fy-context";
import { rangeFrom } from "@/lib/range";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/pager";
import { SearchBox } from "@/components/search-box";
import { StatusBadge } from "@/components/status-badge";
import { ButtonLink, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { DOC_KINDS, isDocKind } from "@/lib/doc-kinds";
import { isoOf, paymentStatus } from "@/lib/documents";
import { formatINR, toPaise } from "@/lib/gst/calc";
import { can } from "@/lib/permissions";
import { requireCompany } from "@/lib/tenant";

export default async function DocListPage({ params, searchParams }: PageProps<"/c/[companyId]/[docKind]">) {
  const { companyId, docKind } = await params;
  if (!isDocKind(docKind)) notFound();
  const sp = await searchParams;
  const ctx = await requireCompany(companyId);
  const cfg = DOC_KINDS[docKind];
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const fy = await selectedFyRange(ctx.companyId);
  const [from, to] = rangeFrom(sp, fy);
  const page = pageFrom(sp);
  const ownOnly = !can(ctx.role, "reports.view"); // staff see only their own documents

  const where: Prisma.DocumentWhereInput = {
    companyId: ctx.companyId,
    type: cfg.type,
    date: { gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T00:00:00Z") },
    ...(ownOnly && { createdById: ctx.user.id }),
    ...(q && { OR: [{ number: { contains: q } }, { partyName: { contains: q } }, { partyGstin: { contains: q } }] }),
  };

  const [rows, sums] = await Promise.all([
    db.document.findMany({
      where,
      orderBy: [{ date: "desc" }, { seq: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      include: {
        allocations: { select: { amount: true } },
        notesOnThis: { where: { status: "ISSUED", type: "CREDIT_NOTE" }, select: { grandTotal: true } },
      },
    }),
    db.document.aggregate({ where: { ...where, status: { not: "CANCELLED" } }, _sum: { taxableTotal: true, grandTotal: true }, _count: true }),
  ]);

  const base = `/c/${ctx.companyId}/${docKind}`;
  const showPayment = cfg.type === "INVOICE" || cfg.type === "DEBIT_NOTE";

  return (
    <>
      <PageHeader
        title={cfg.title}
        subtitle={`${sums._count} documents · ${formatINR(toPaise(sums._sum.grandTotal?.toNumber() ?? 0))} total`}
        actions={<ButtonLink href={`${base}/new`}>+ New {cfg.singular.toLowerCase()}</ButtonLink>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search number, party, GSTIN" />
        <DateRangeFilter from={from} to={to} fy={fy} />
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty
            icon={FileText}
            title={q ? "No matches" : `No ${cfg.title.toLowerCase()} yet`}
            action={!q && <ButtonLink href={`${base}/new`} size="sm">Create {cfg.singular.toLowerCase()}</ButtonLink>}
          >
            {q ? "Nothing matches your search in this period." : "Nothing in this period. Change the dates above or create a new one."}
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Date</Th>
                <Th>Party</Th>
                <Th className="text-right">Taxable</Th>
                <Th className="text-right">Total</Th>
                {showPayment && <Th className="text-right">Balance</Th>}
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE_SIZE).map((d) => {
                const grand = toPaise(d.grandTotal.toNumber());
                const paid = d.allocations.reduce((a, x) => a + toPaise(x.amount.toNumber()), 0);
                const credited = d.notesOnThis.reduce((a, x) => a + toPaise(x.grandTotal.toNumber()), 0);
                const balance = Math.max(0, grand - paid - credited);
                const status =
                  d.status === "CANCELLED" || !showPayment ? d.status : paymentStatus({ grandTotal: grand, balance, dueDate: isoOf(d.dueDate) });
                return (
                  <tr key={d.id} className={d.status === "CANCELLED" ? "text-muted line-through" : "hover:bg-background"}>
                    <Td>
                      <Link href={`${base}/${d.id}`} className="font-medium text-primary hover:underline">
                        {d.number}
                      </Link>
                    </Td>
                    <Td>{isoOf(d.date)}</Td>
                    <Td>{d.partyName}</Td>
                    <Td className="tabular text-right">{formatINR(toPaise(d.taxableTotal.toNumber()))}</Td>
                    <Td className="tabular text-right">{formatINR(grand)}</Td>
                    {showPayment && <Td className="tabular text-right">{d.status === "CANCELLED" ? "—" : formatINR(balance)}</Td>}
                    <Td className="no-underline">
                      <StatusBadge status={status} />
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
