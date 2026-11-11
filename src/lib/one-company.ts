import "server-only";
import { UserError } from "./action";
import { db, type Tx } from "./db";

/**
 * Business rule: a user belongs to exactly ONE company, in any role (Owner, Accountant or Staff).
 * Enforced twice:
 *  1. Friendly pre-checks below (clear error messages).
 *  2. A unique index on membership.userId, so the rule holds even for concurrent requests.
 */

/** The company this user belongs to, if any. */
export async function userCompany(userId: string, tx: Tx | typeof db = db) {
  const m = await tx.membership.findUnique({
    where: { userId },
    select: { role: true, company: { select: { id: true, legalName: true, tradeName: true } } },
  });
  return m ? { ...m.company, role: m.role } : null;
}

/** Throws a user-facing error if `userId` already belongs to a company (other than `exceptCompanyId`). */
export async function assertNoCompany(userId: string, who: "You" | string, tx: Tx | typeof db = db, exceptCompanyId?: string) {
  const c = await userCompany(userId, tx);
  if (c && c.id !== exceptCompanyId) {
    const name = c.tradeName || c.legalName;
    throw new UserError(
      who === "You"
        ? `You already belong to "${name}". Each user can be part of only one company — use a different email for another company.`
        : `${who} already belongs to another company ("${name}"). Each user can be part of only one company.`,
    );
  }
}

/** Same check by email (for invitations, where the person may not have an account yet). */
export async function assertEmailHasNoCompany(email: string, exceptCompanyId?: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
  if (user) await assertNoCompany(user.id, email, db, exceptCompanyId);
}

/** True if the error is the membership.userId unique-index violation (race between two requests). */
export function isOneCompanyConflict(err: unknown) {
  const e = err as { code?: string; meta?: { target?: unknown }; message?: string };
  return e?.code === "P2002" && /membership_userId_key|\buserId\b/i.test(`${JSON.stringify(e.meta?.target ?? "")} ${e.message ?? ""}`);
}
