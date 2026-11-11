import "server-only";
import Link from "next/link";
import type { ReactNode } from "react";
import { DateRangeFilter } from "@/components/date-range";
import { ButtonLink } from "@/components/ui";
import { selectedFyRange } from "@/lib/fy-context";
import { rangeFrom } from "@/lib/range";
import { requireCompanyPage } from "@/lib/tenant";

type SP = Record<string, string | string[] | undefined>;

/** Resolves company context + date range (defaulting to the selected FY) for report pages. */
export async function reportContext(companyId: string, sp: SP) {
  const ctx = await requireCompanyPage(companyId, "reports.view");
  const fy = await selectedFyRange(ctx.companyId);
  const [from, to] = rangeFrom(sp, fy);
  return { ctx, fy, from, to, base: `/c/${ctx.companyId}/reports` };
}

export function ReportHeader({
  title,
  subtitle,
  base,
  from,
  to,
  fy,
  csv,
  noRange,
}: {
  title: string;
  subtitle?: ReactNode;
  base: string;
  from: string;
  to: string;
  fy: [string, string];
  csv?: string;
  noRange?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={base} className="text-xs text-primary hover:underline">
            ← Reports
          </Link>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="text-muted">{subtitle}</p>}
        </div>
        {csv && (
          <ButtonLink variant="secondary" href={csv} prefetch={false}>
            Export CSV
          </ButtonLink>
        )}
      </div>
      {!noRange && <DateRangeFilter from={from} to={to} fy={fy} />}
    </div>
  );
}

export const csvHref = (base: string, params: Record<string, string>) => `${base}/csv?${new URLSearchParams(params)}`;
