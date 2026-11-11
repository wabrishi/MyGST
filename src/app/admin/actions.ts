"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { requireSuperAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { createInvitation } from "@/lib/invitations";
import { assertEmailHasNoCompany, assertNoCompany } from "@/lib/one-company";
import { escapeHtml, sendMail } from "@/lib/mail";
import { optionalGstin, stateCode, trimmed } from "@/lib/validation";
import { stateFromGstin } from "@/lib/gst/gstin";

const newCompanySchema = z
  .object({
    legalName: trimmed(150).min(1, "Legal name is required"),
    tradeName: trimmed(150).default(""),
    gstin: optionalGstin.default(""),
    stateCode,
    ownerEmail: z.string().trim().toLowerCase().pipe(z.email("Enter the owner's email")),
  })
  .superRefine((v, ctx) => {
    if (v.gstin && stateFromGstin(v.gstin) !== v.stateCode) ctx.addIssue({ code: "custom", path: ["stateCode"], message: "State must match the GSTIN" });
  });

export type NewCompanyInput = z.input<typeof newCompanySchema>;

export interface CreatedCompany {
  companyId: string;
  /** "member" = existing user added directly; "invited" = invitation created. */
  owner: "member" | "invited";
  link?: string;
  emailed?: boolean;
}

/**
 * Super-admin creates a company and hands it to its owner. Existing users are added as OWNER
 * immediately; new people get an OWNER invitation. The admin does not become a member.
 */
export async function adminCreateCompany(input: NewCompanyInput): Promise<ActionResult<CreatedCompany>> {
  return run<CreatedCompany>(async () => {
    const admin = await requireSuperAdmin();
    const { ownerEmail, ...data } = newCompanySchema.parse(input);
    // Check before creating anything so a rejected owner doesn't leave an orphan company behind.
    const existingUser = await db.user.findUnique({ where: { email: ownerEmail } });
    if (existingUser) await assertNoCompany(existingUser.id, ownerEmail);
    const company = await db.company.create({ data: { ...data, createdVia: "ADMIN" } });
    await db.auditLog.create({ data: { companyId: company.id, userId: admin.id, action: "admin_create", entity: "company", entityId: company.id } });
    const companyName = company.tradeName || company.legalName;

    if (existingUser) {
      await db.membership.create({ data: { userId: existingUser.id, companyId: company.id, role: "OWNER" } });
      const url = `${process.env.APP_URL ?? process.env.BETTER_AUTH_URL}/c/${company.id}/setup`;
      await sendMail({
        to: ownerEmail,
        subject: `${companyName} is ready on MyGST`,
        html: `<p>Hi ${escapeHtml(existingUser.name)},</p><p>A company <b>${escapeHtml(companyName)}</b> has been created for you. You are its owner.</p><p><a href="${escapeHtml(url)}">Complete company setup</a></p>`,
      });
      revalidatePath("/admin");
      return ok<CreatedCompany>({ companyId: company.id, owner: "member" });
    }

    const inv = await createInvitation({ companyId: company.id, companyName, email: ownerEmail, role: "OWNER", invitedBy: admin });
    revalidatePath("/admin");
    return ok<CreatedCompany>({ companyId: company.id, owner: "invited", ...inv });
  });
}

export async function adminInvite(companyId: string, input: { email: string; role: string }): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  return run(async () => {
    const admin = await requireSuperAdmin();
    const { email, role } = z
      .object({ email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")), role: z.enum(["OWNER", "ACCOUNTANT", "STAFF"]) })
      .parse(input);
    const company = await db.company.findUnique({ where: { id: companyId } });
    if (!company) throw new UserError("Company not found");
    if (await db.membership.findFirst({ where: { companyId, user: { email } } })) throw new UserError("Already a member", "email");
    await assertEmailHasNoCompany(email, companyId);
    const inv = await createInvitation({ companyId, companyName: company.tradeName || company.legalName, email, role, invitedBy: admin });
    revalidatePath(`/admin/companies/${companyId}`);
    return ok(inv);
  });
}

export async function adminSetSuspended(companyId: string, suspended: boolean): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireSuperAdmin();
    const r = await db.company.updateMany({ where: { id: companyId }, data: { suspendedAt: suspended ? new Date() : null } });
    if (r.count !== 1) throw new UserError("Company not found");
    await db.auditLog.create({
      data: { companyId, userId: admin.id, action: suspended ? "admin_suspend" : "admin_reactivate", entity: "company", entityId: companyId },
    });
    revalidatePath("/admin", "layout");
    return ok(undefined, suspended ? "Company suspended" : "Company reactivated");
  });
}
