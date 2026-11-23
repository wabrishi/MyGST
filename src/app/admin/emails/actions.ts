"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { adminAudit, requireAdminAction } from "@/lib/admin";
import { db } from "@/lib/db";
import { renderTemplate, sampleVars, templateDef, usedVars } from "@/lib/email-templates";
import { mailEnabled, sendMail } from "@/lib/mail";

const input = z.object({
  subject: z.string().trim().min(1, "Enter a subject").max(300),
  body: z.string().trim().min(1, "Write the email").max(50_000),
});

function check(key: string, raw: unknown) {
  const def = templateDef(key);
  if (!def) throw new UserError("Unknown template");
  const t = input.parse(raw);
  const unknown = usedVars(`${t.subject} ${t.body}`).filter((v) => !(v in def.vars));
  if (unknown.length) throw new UserError(`Unknown variable${unknown.length > 1 ? "s" : ""}: ${unknown.map((v) => `{{${v}}}`).join(", ")}`);
  return { def, t };
}

const refresh = (key: string) => {
  revalidatePath("/admin/emails");
  revalidatePath(`/admin/emails/${key}`);
};

export async function adminSaveTemplate(key: string, raw: { subject: string; body: string }): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("emails.manage");
    const { t } = check(key, raw);
    await db.emailTemplate.upsert({ where: { key }, create: { key, ...t, updatedBy: admin.user.email }, update: { ...t, updatedBy: admin.user.email } });
    await adminAudit(admin, "email_template.update", "email_template", key, { subject: t.subject });
    refresh(key);
    return ok(undefined, "Template saved. It's used for every email from now on.");
  });
}

export async function adminResetTemplate(key: string): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("emails.manage");
    if (!templateDef(key)) throw new UserError("Unknown template");
    await db.emailTemplate.deleteMany({ where: { key } });
    await adminAudit(admin, "email_template.reset", "email_template", key);
    refresh(key);
    return ok(undefined, "Back to the default template");
  });
}

/** Sends the (unsaved) draft with sample values to the signed-in admin. */
export async function adminSendTestTemplate(key: string, raw: { subject: string; body: string }): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("emails.manage");
    const { def, t } = check(key, raw);
    const { subject, html } = renderTemplate(t, sampleVars(def));
    await sendMail({ to: admin.user.email, subject: `[Test] ${subject}`, html });
    return ok(undefined, mailEnabled() ? `Test sent to ${admin.user.email}` : "Email isn't configured (SMTP_HOST): the test was printed in the server log");
  });
}
