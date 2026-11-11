"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { DocType } from "@/generated/prisma/enums";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { PREFIX_PATTERN, financialYear, todayIST } from "@/lib/gst/fy";
import { createInvitation } from "@/lib/invitations";
import { assertEmailHasNoCompany } from "@/lib/one-company";
import { ensureSeries } from "@/lib/numbering";
import { requireCompany } from "@/lib/tenant";
import { companySchema, type CompanyInput } from "@/lib/validation";

export async function updateCompany(companyId: string, input: CompanyInput): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    // Partial submissions (setup wizard steps) are merged over the saved record before validation.
    const current = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, omit: { logo: true } });
    const data = companySchema.parse({ ...current, terms: current.terms ?? "", ...input });
    await db.company.update({ where: { id: ctx.companyId }, data });
    await audit(ctx, "update", "company", ctx.companyId);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok(undefined, "Company details saved");
  });
}

const LOGO_TYPES = ["image/png", "image/jpeg"]; // PDF renderer supports PNG/JPEG only

export async function uploadLogo(companyId: string, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    const file = form.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      await db.company.update({ where: { id: ctx.companyId }, data: { logo: null, logoMime: null } });
      revalidatePath(`/c/${ctx.companyId}/settings/company`);
      return ok(undefined, "Logo removed");
    }
    if (!LOGO_TYPES.includes(file.type)) throw new UserError("Logo must be PNG or JPEG");
    if (file.size > 200 * 1024) throw new UserError("Logo must be under 200 KB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    await db.company.update({ where: { id: ctx.companyId }, data: { logo: bytes, logoMime: file.type } });
    revalidatePath(`/c/${ctx.companyId}/settings/company`);
    return ok(undefined, "Logo updated");
  });
}

// ─────────────── Users & invitations ───────────────

const roleSchema = z.enum(["OWNER", "ACCOUNTANT", "STAFF"]);

export async function inviteUser(
  companyId: string,
  input: { email: string; role: string },
): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.users");
    const { email, role } = z
      .object({ email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")), role: roleSchema })
      .parse(input);

    const existing = await db.membership.findFirst({ where: { companyId: ctx.companyId, user: { email } } });
    if (existing) throw new UserError("This person is already a member", "email");
    await assertEmailHasNoCompany(email, ctx.companyId);

    const result = await createInvitation({
      companyId: ctx.companyId,
      companyName: ctx.company.tradeName || ctx.company.legalName,
      email,
      role,
      invitedBy: ctx.user,
    });
    revalidatePath(`/c/${ctx.companyId}/settings/users`);
    return ok(result);
  });
}

export async function revokeInvite(companyId: string, inviteId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.users");
    await db.invitation.deleteMany({ where: { id: inviteId, companyId: ctx.companyId } });
    revalidatePath(`/c/${ctx.companyId}/settings/users`);
    return ok(undefined);
  });
}

/** Loads a member of this company; if they are losing OWNER, ensures another owner remains. */
async function loadMember(companyId: string, membershipId: string, losingOwner: (role: string) => boolean) {
  const m = await db.membership.findFirst({ where: { id: membershipId, companyId } });
  if (!m) throw new UserError("Member not found");
  if (m.role === "OWNER" && losingOwner(m.role)) {
    const owners = await db.membership.count({ where: { companyId, role: "OWNER" } });
    if (owners <= 1) throw new UserError("A company must have at least one owner");
  }
  return m;
}

export async function changeRole(companyId: string, membershipId: string, role: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.users");
    const newRole = roleSchema.parse(role);
    const m = await loadMember(ctx.companyId, membershipId, () => newRole !== "OWNER");
    if (m.role === newRole) return ok(undefined);
    await db.membership.update({ where: { id: m.id }, data: { role: newRole } });
    await audit(ctx, "role", "membership", m.id, { from: m.role, to: newRole });
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok(undefined, "Role updated");
  });
}

export async function removeMember(companyId: string, membershipId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.users");
    const m = await loadMember(ctx.companyId, membershipId, () => true);
    await db.membership.delete({ where: { id: m.id } });
    await audit(ctx, "remove", "membership", m.id, { userId: m.userId });
    revalidatePath(`/c/${ctx.companyId}/settings/users`);
    return ok(undefined, "Member removed");
  });
}

// ─────────────── Numbering ───────────────

const DOC_TYPES = ["INVOICE", "QUOTATION", "CREDIT_NOTE", "DEBIT_NOTE"] as const;

export async function updatePrefixes(companyId: string, input: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    const fy = financialYear(todayIST());
    const prefixes = z
      .object(
        Object.fromEntries(
          DOC_TYPES.map((t) => [t, z.string().trim().toUpperCase().regex(PREFIX_PATTERN, "Up to 6 characters: A–Z, 0–9, / or -")]),
        ) as Record<DocType, z.ZodString>,
      )
      .parse(input);
    const values = Object.values(prefixes);
    if (new Set(values).size !== values.length) throw new UserError("Each document type needs a different prefix");

    await db.$transaction(async (tx) => {
      for (const t of DOC_TYPES) {
        await ensureSeries(tx, ctx.companyId, t, fy);
        await tx.numberSeries.update({
          where: { companyId_docType_fy: { companyId: ctx.companyId, docType: t, fy } },
          data: { prefix: prefixes[t] },
        });
      }
    });
    await audit(ctx, "update", "numbering", fy, prefixes);
    revalidatePath(`/c/${ctx.companyId}/settings/numbering`);
    return ok(undefined, "Numbering saved");
  });
}

// ─────────────── Setup wizard ───────────────

export async function finishSetup(companyId: string): Promise<ActionResult> {
  const res = await run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    await db.company.update({ where: { id: ctx.companyId }, data: { setupCompletedAt: new Date() } });
    await audit(ctx, "finish", "setup", ctx.companyId);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok(undefined);
  });
  if (res.ok) redirect(`/c/${companyId}/dashboard?setup=done`);
  return res;
}
