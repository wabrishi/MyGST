import "server-only";
import { db } from "./db";
import { financialYearRange, monthRange, todayIST } from "./gst/fy";

/**
 * Platform-wide figures for the admin overview. Aggregations are plain SQL that works on both MySQL
 * and MariaDB (Hostinger). Sales = invoices that aren't cancelled, by document date, incl. GST.
 */

export interface SeriesPoint {
  key: string;
  label: string;
  value: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const num = (v: unknown) => Number(v ?? 0);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The last `n` months (oldest first) as YYYY-MM keys, ending with the month of `today`. */
export function lastMonths(today: string, n: number): Array<{ key: string; label: string }> {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    const key = d.toISOString().slice(0, 7);
    return { key, label: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` };
  });
}

/** The last `n` weeks (Monday starts, oldest first), ending with the week of `today`. */
export function lastWeeks(today: string, n: number): Array<{ key: string; label: string }> {
  const t = new Date(today + "T00:00:00Z");
  const monday = new Date(t);
  monday.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() - 7 * (n - 1 - i));
    return { key: isoDay(d), label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` };
  });
}

/** Fills a bucket list from SQL rows keyed the same way (missing buckets are 0). */
export function fillSeries(buckets: Array<{ key: string; label: string }>, rows: Array<{ k: unknown; v: unknown }>): SeriesPoint[] {
  const map = new Map(rows.map((r) => [String(r.k instanceof Date ? isoDay(r.k) : r.k), num(r.v)]));
  return buckets.map((b) => ({ ...b, value: map.get(b.key) ?? 0 }));
}

export async function platformOverview(now = new Date()) {
  const today = todayIST(now);
  const [monthStart] = monthRange(today);
  const [fyStart] = financialYearRange(today);
  const months = lastMonths(today, 12);
  const weeks = lastWeeks(today, 12);
  const weekStart = weeks[0].key;
  const since24h = new Date(now.getTime() - 24 * 3600 * 1000);

  const [companies, suspended, setupPending, users, disabledUsers, newUsersWeek, pluginsInstalled, invoiceMonth, invoiceFy, monthly, signups, top, deadEvents, pluginErrors] =
    await Promise.all([
      db.company.count(),
      db.company.count({ where: { suspendedAt: { not: null } } }),
      db.company.count({ where: { setupCompletedAt: null, suspendedAt: null } }),
      db.user.count(),
      db.user.count({ where: { disabledAt: { not: null } } }),
      db.user.count({ where: { createdAt: { gte: new Date(weeks[weeks.length - 1].key + "T00:00:00+05:30") } } }),
      db.plugin.count({ where: { status: "INSTALLED" } }),
      db.document.aggregate({ where: { type: "INVOICE", cancelledAt: null, date: { gte: new Date(monthStart) } }, _count: true, _sum: { grandTotal: true } }),
      db.document.aggregate({ where: { type: "INVOICE", cancelledAt: null, date: { gte: new Date(fyStart) } }, _count: true, _sum: { grandTotal: true } }),
      db.$queryRaw<Array<{ k: string; n: bigint; v: unknown }>>`
        SELECT DATE_FORMAT(\`date\`, '%Y-%m') AS k, COUNT(*) AS n, SUM(grandTotal) AS v
        FROM document WHERE type = 'INVOICE' AND cancelledAt IS NULL AND \`date\` >= ${new Date(months[0].key + "-01")}
        GROUP BY k`,
      db.$queryRaw<Array<{ k: Date | string; v: bigint }>>`
        SELECT DATE_SUB(DATE(createdAt), INTERVAL WEEKDAY(createdAt) DAY) AS k, COUNT(*) AS v
        FROM \`user\` WHERE createdAt >= ${new Date(weekStart + "T00:00:00Z")}
        GROUP BY k`,
      db.$queryRaw<Array<{ companyId: string; v: unknown; n: bigint }>>`
        SELECT companyId, SUM(grandTotal) AS v, COUNT(*) AS n
        FROM document WHERE type = 'INVOICE' AND cancelledAt IS NULL AND \`date\` >= ${new Date(fyStart)}
        GROUP BY companyId ORDER BY v DESC LIMIT 10`,
      db.outboxEvent.count({ where: { status: "DEAD" } }),
      db.pluginLog.count({ where: { level: "error", createdAt: { gte: since24h } } }),
    ]);

  const names = await db.company.findMany({ where: { id: { in: top.map((t) => t.companyId) } }, select: { id: true, legalName: true, tradeName: true } });
  const nameOf = new Map(names.map((c) => [c.id, c.tradeName || c.legalName]));

  return {
    today,
    fyStart,
    companies: { total: companies, suspended, setupPending, active: companies - suspended - setupPending },
    users: { total: users, disabled: disabledUsers, newThisWeek: newUsersWeek },
    pluginsInstalled,
    invoices: {
      month: { count: invoiceMonth._count, value: num(invoiceMonth._sum.grandTotal) },
      fy: { count: invoiceFy._count, value: num(invoiceFy._sum.grandTotal) },
    },
    invoicesPerMonth: fillSeries(months, monthly.map((r) => ({ k: r.k, v: r.n }))),
    salesPerMonth: fillSeries(months, monthly.map((r) => ({ k: r.k, v: r.v }))),
    signupsPerWeek: fillSeries(weeks, signups),
    topCompanies: top.map((t) => ({ id: t.companyId, name: nameOf.get(t.companyId) ?? "(deleted)", value: num(t.v), invoices: num(t.n) })),
    attention: { deadEvents, pluginErrors },
  };
}
