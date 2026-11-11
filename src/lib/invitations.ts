import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@/generated/prisma/enums";
import { db } from "./db";
import { escapeHtml, mailEnabled, sendMail } from "./mail";
import { ROLE_LABEL } from "./permissions";

export const hashInviteToken = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * Creates (or replaces) a pending invitation and emails the link. Only the token's hash is stored,
 * so the returned link is the only copy — show it to the inviter when email isn't configured.
 */
export async function createInvitation(opts: {
  companyId: string;
  companyName: string;
  email: string;
  role: Role;
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
        role: opts.role,
        tokenHash: hashInviteToken(token),
        invitedBy: opts.invitedBy.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    await tx.auditLog.create({
      data: { companyId: opts.companyId, userId: opts.invitedBy.id, action: "invite", entity: "user", entityId: email, data: { role: opts.role } },
    });
  });

  const link = `${process.env.APP_URL ?? process.env.BETTER_AUTH_URL}/invite/${token}`;
  await sendMail({
    to: email,
    subject: `${opts.invitedBy.name} invited you to ${opts.companyName} on MyGST`,
    html: `<p>${escapeHtml(opts.invitedBy.name)} has invited you to join <b>${escapeHtml(opts.companyName)}</b> as <b>${ROLE_LABEL[opts.role]}</b>.</p>
<p><a href="${escapeHtml(link)}">Accept invitation</a></p>
<p>If you don't have a MyGST account yet, sign up with this email address first. The link expires in 7 days.</p>`,
  });
  return { link, emailed: mailEnabled() };
}
