import "server-only";
import { db } from "./db";
import { sendTemplate } from "./email-render";
import { partyNetworkStatus } from "./network";

/**
 * Invites a customer/supplier to MyGSTBook, once per email address (from any company), and only when
 * they aren't on MyGSTBook already (no company with their GSTIN, no user with their email).
 */
export async function inviteParty(
  company: { id: string; name: string },
  party: { id: string; name: string; email: string; gstin: string },
): Promise<"sent" | "on-portal" | "already-invited" | "no-email"> {
  const email = party.email.trim().toLowerCase();
  if (!email) return "no-email";
  const status = await partyNetworkStatus({ gstin: party.gstin, email }, company.id);
  if (status.kind === "on-portal") return "on-portal";
  if (status.kind === "invited") return "already-invited";
  // Claim the address first (unique), so two saves at once never send twice.
  try {
    await db.partyInvite.create({ data: { email, invitedByCompanyId: company.id, partyId: party.id } });
  } catch {
    return "already-invited";
  }
  const base = (process.env.APP_URL || process.env.BETTER_AUTH_URL || "").replace(/\/+$/, "");
  try {
    await sendTemplate("party_invite", email, { partyName: party.name, companyName: company.name, url: `${base}/signup?invite=1&email=${encodeURIComponent(email)}` });
  } catch (e) {
    console.error("[party-invite] email failed:", (e as Error).message);
  }
  return "sent";
}

/** Called when someone signs up: their invitation (if any) is marked as joined. */
export async function markInviteJoined(email: string) {
  await db.partyInvite.updateMany({ where: { email: email.trim().toLowerCase(), joinedAt: null }, data: { joinedAt: new Date() } }).catch(() => {});
}
