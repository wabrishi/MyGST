import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { sendTemplate } from "./email-render";
import { mailEnabled } from "./mail";
import { roleNames } from "./permissions";

export const hashInviteToken = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * Creates (or replaces) a pending invitation and emails the link. Only the token's hash is stored,
 * so the returned link is the only copy — show it to the inviter when email isn't configured.
 */
export async function createInvitation(opts: {
  companyId: string;
  companyName: string;
  email: string;
  /** Validated CompanyRole ids (see validRoleIds). */
  roleIds: string[];
  invitedBy: { id: string; name: string };
}) {
  const email = opts.email.trim().toLowerCase();
  const token = randomBytes(32).toString("base64url");
  await db.$transaction(async (tx) => {
    await tx.invitation.deleteMany({ where: { companyId: opts.companyId, email, acceptedAt: null } });
    await tx.invitation.create({
      data: {
        companyId: opts.companyId,
        email,
        roleIds: opts.roleIds,
        tokenHash: hashInviteToken(token),
        invitedBy: opts.invitedBy.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    await tx.auditLog.create({
      data: { companyId: opts.companyId, userId: opts.invitedBy.id, action: "invite", entity: "user", entityId: email, data: { roleIds: opts.roleIds } },
    });
  });

  const roles = await db.companyRole.findMany({ where: { id: { in: opts.roleIds } }, select: { name: true } });
  const link = `${process.env.APP_URL ?? process.env.BETTER_AUTH_URL}/invite/${token}`;
  await sendTemplate("member_invite", email, { inviterName: opts.invitedBy.name, companyName: opts.companyName, roles: roleNames(roles), url: link });
  return { link, emailed: mailEnabled() };
}
