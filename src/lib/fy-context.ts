import "server-only";
import { cookies } from "next/headers";
import { UserError } from "./action";
import { db, type Tx } from "./db";
import { financialYear, financialYearRange, todayIST } from "./gst/fy";

/**
 * Financial-year context. The selected FY (per company, kept in a cookie) scopes lists, reports
 * and the dashboard. Closed years are locked via Company.lockedUntil.
 */

const cookieName = (companyId: string) => `mygst_fy_${companyId}`;
const FY_RE = /^\d{2}-\d{2}$/;

/** "26-27" -> ["2026-04-01", "2027-03-31"] */
export const fyRange = (fy: string): [string, string] => financialYearRange(`20${fy.slice(0, 2)}-06-01`);
export const fyLabel = (fy: string) => `FY 20${fy}`;

export async function getSelectedFy(companyId: string): Promise<string> {
  const v = (await cookies()).get(cookieName(companyId))?.value;
  return v && FY_RE.test(v) ? v : financialYear(todayIST());
}

export async function setSelectedFy(companyId: string, fy: string) {
  if (!FY_RE.test(fy)) throw new UserError("Invalid financial year");
  (await cookies()).set(cookieName(companyId), fy, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
}

export async function selectedFyRange(companyId: string) {
  return fyRange(await getSelectedFy(companyId));
}

/** FYs from the company's earliest transaction (or creation) through the current FY, newest first. */
export async function availableFys(companyId: string): Promise<string[]> {
  const [company, firstDoc, firstBill] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId }, select: { createdAt: true } }),
    db.document.findFirst({ where: { companyId }, orderBy: { date: "asc" }, select: { date: true } }),
    db.purchaseBill.findFirst({ where: { companyId }, orderBy: { billDate: "asc" }, select: { billDate: true } }),
  ]);
  const dates = [company.createdAt, firstDoc?.date, firstBill?.billDate].filter(Boolean) as Date[];
  const earliest = financialYear(new Date(Math.min(...dates.map((d) => d.getTime()))).toISOString().slice(0, 10));
  const current = financialYear(todayIST());
  const out: string[] = [];
  for (let y = Number(current.slice(0, 2)); y >= Number(earliest.slice(0, 2)); y--) out.push(`${String(y).padStart(2, "0")}-${String(y + 1).padStart(2, "0")}`);
  return out;
}

/** Throws if any of the given dates falls in a locked (closed) period. Call inside the write transaction. */
export async function assertNotLocked(tx: Tx | typeof db, companyId: string, ...dates: Array<string | Date | null | undefined>) {
  const c = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { lockedUntil: true } });
  if (!c.lockedUntil) return;
  const lock = c.lockedUntil.toISOString().slice(0, 10);
  for (const d of dates) {
    if (!d) continue;
    const iso = typeof d === "string" ? d : d.toISOString().slice(0, 10);
    if (iso <= lock) throw new UserError(`Books are closed up to ${lock}. Re-open the financial year in Settings to make changes.`);
  }
}
