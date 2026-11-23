import "server-only";
import { db, type Tx } from "./db";

/**
 * The MyGSTBook network: companies find each other by GSTIN. A GSTIN matches only when exactly one
 * active company has it (and it isn't the asking company), so a duplicate or self-match never leaks
 * documents. GSTINs aren't verified at sign-up; Admin → Companies flags duplicates.
 */
export async function findNetworkCompany(gstin: string | null | undefined, excludeCompanyId?: string, tx: Tx | typeof db = db) {
  const g = (gstin ?? "").trim().toUpperCase();
  if (g.length !== 15) return null;
  const found = await tx.company.findMany({
    where: { gstin: g, suspendedAt: null },
    select: { id: true, legalName: true, tradeName: true, gstin: true, email: true, phone: true, address: true, city: true, pincode: true, stateCode: true },
    take: 2,
  });
  if (found.length !== 1 || found[0].id === excludeCompanyId) return null;
  return found[0];
}

/** GSTINs used by more than one company (shown as a warning to platform admins). */
export async function duplicateGstins() {
  const rows = await db.company.groupBy({ by: ["gstin"], where: { gstin: { not: "" } }, _count: { _all: true }, having: { gstin: { _count: { gt: 1 } } } });
  return new Set(rows.map((r) => r.gstin));
}

/** on-portal: `name` is set only when documents will actually be shared (exactly one company, by GSTIN). */
export type NetworkStatus = { kind: "on-portal"; name: string } | { kind: "invited"; sentAt: Date; joinedAt: Date | null } | { kind: "none" };

/** Is this party already on MyGSTBook (by GSTIN or email), or invited? */
export async function partyNetworkStatus(p: { gstin?: string | null; email?: string | null }, companyId: string): Promise<NetworkStatus> {
  const company = await findNetworkCompany(p.gstin, companyId);
  if (company) return { kind: "on-portal", name: company.tradeName || company.legalName };
  // For invitations any company with this GSTIN counts (even duplicates, which aren't shared with).
  const g = (p.gstin ?? "").trim().toUpperCase();
  if (g.length === 15 && (await db.company.count({ where: { gstin: g, id: { not: companyId } } }))) return { kind: "on-portal", name: "" };
  const email = (p.email ?? "").trim().toLowerCase();
  if (!email) return { kind: "none" };
  const [user, invite] = await Promise.all([db.user.findUnique({ where: { email }, select: { id: true } }), db.partyInvite.findUnique({ where: { email } })]);
  if (user) return { kind: "on-portal", name: "" };
  if (invite) return { kind: "invited", sentAt: invite.sentAt, joinedAt: invite.joinedAt };
  return { kind: "none" };
}
