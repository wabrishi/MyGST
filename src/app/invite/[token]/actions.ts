"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { run, UserError, type ActionResult, ok } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertNoCompany } from "@/lib/one-company";

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
      await tx.membership.upsert({
        where: { userId_companyId: { userId: user.id, companyId: invite.companyId } },
        create: { userId: user.id, companyId: invite.companyId, role: invite.role },
        update: {},
      });
      await tx.auditLog.create({
        data: { companyId: invite.companyId, userId: user.id, action: "accept", entity: "invitation", entityId: invite.id },
      });
      const company = await tx.company.findUniqueOrThrow({ where: { id: invite.companyId }, select: { setupCompletedAt: true } });
      return { companyId: invite.companyId, toSetup: invite.role === "OWNER" && !company.setupCompletedAt };
    });
    return ok(companyId);
  });
  if (res.ok) redirect(`/c/${res.data.companyId}/${res.data.toSetup ? "setup" : "dashboard"}`);
  return res;
}
