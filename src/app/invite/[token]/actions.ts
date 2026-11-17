"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { run, UserError, type ActionResult, ok } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertNoCompany } from "@/lib/one-company";
import { holdsOwner, validRoleIds } from "@/lib/roles";

export async function acceptInvite(token: string): Promise<ActionResult<{ companyId: string; toSetup: boolean }>> {
  const user = await requireUser();
  const res = await run(async () => {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const companyId = await db.$transaction(async (tx) => {
      const invite = await tx.invitation.findUnique({ where: { tokenHash } });
      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw new UserError("Invitation is invalid or expired");
      if (invite.email.toLowerCase() !== user.email.toLowerCase()) throw new UserError("This invitation is for a different email");
      await assertNoCompany(user.id, "You", tx, invite.companyId);
      // Mark used first (conditional update) so a token can't be redeemed twice concurrently.
      const used = await tx.invitation.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      if (used.count !== 1) throw new UserError("Invitation already used");
      // Roles may have been deleted since the invite was sent: then the invite can't be used.
      const roleIds = await validRoleIds(invite.companyId, invite.roleIds, tx).catch(() => {
        throw new UserError("The role in this invitation no longer exists. Ask for a new invitation.");
      });
      const existing = await tx.membership.findUnique({ where: { userId_companyId: { userId: user.id, companyId: invite.companyId } } });
      if (!existing) {
        await tx.membership.create({ data: { userId: user.id, companyId: invite.companyId, roles: { create: roleIds.map((roleId) => ({ roleId })) } } });
      }
      await tx.auditLog.create({
        data: { companyId: invite.companyId, userId: user.id, action: "accept", entity: "invitation", entityId: invite.id },
      });
      const company = await tx.company.findUniqueOrThrow({ where: { id: invite.companyId }, select: { setupCompletedAt: true } });
      return { companyId: invite.companyId, toSetup: holdsOwner(roleIds) && !company.setupCompletedAt };
    });
    return ok(companyId);
  });
  if (res.ok) redirect(`/c/${res.data.companyId}/${res.data.toSetup ? "setup" : "dashboard"}`);
  return res;
}
