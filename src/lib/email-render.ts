import "server-only";
import { db } from "./db";
import { renderTemplate, templateDef, type TemplateKey } from "./email-templates";
import { sendMail, type MailInput } from "./mail";

/** A template as it's used now: the super admin's edited version, else the default. */
export async function effectiveTemplate(key: TemplateKey) {
  const def = templateDef(key);
  if (!def) throw new Error(`Unknown email template "${key}"`);
  const saved = await db.emailTemplate.findUnique({ where: { key } }).catch(() => null);
  return { def, subject: saved?.subject ?? def.subject, body: saved?.body ?? def.body, edited: !!saved, updatedAt: saved?.updatedAt ?? null };
}

/** Subject + full HTML for a system email. Values are escaped in the body. */
export async function renderEmail(key: TemplateKey, vars: Record<string, string | null | undefined>) {
  const t = await effectiveTemplate(key);
  return renderTemplate(t, vars);
}

/** Renders a template and sends it. */
export async function sendTemplate(key: TemplateKey, to: string, vars: Record<string, string | null | undefined>, extra: Pick<MailInput, "attachments"> = {}) {
  const { subject, html } = await renderEmail(key, vars);
  await sendMail({ to, subject, html, ...extra });
}
