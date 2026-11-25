import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { effectiveTemplate } from "@/lib/email-render";
import { templateDef, type TemplateKey } from "@/lib/email-templates";
import { TemplateEditor } from "./template-editor";

export const metadata = { title: "Edit email" };

export default async function AdminEmailTemplatePage({ params }: PageProps<"/admin/emails/[key]">) {
  const admin = await requireAdmin("emails.manage");
  const { key } = await params;
  const def = templateDef(key);
  if (!def) notFound();
  const t = await effectiveTemplate(key as TemplateKey);
  return (
    <>
      <Link href="/admin/emails" className="text-xs text-primary hover:underline">
        ← All emails
      </Link>
      <PageHeader
        title={def.label}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {t.edited ? <Badge color="blue">Edited</Badge> : <Badge>Default</Badge>}
            {def.description}
          </span>
        }
      />
      <TemplateEditor
        templateKey={def.key}
        initial={{ subject: t.subject, body: t.body }}
        defaults={{ subject: def.subject, body: def.body }}
        vars={Object.entries(def.vars).map(([name, v]) => ({ name, help: v.help, sample: v.sample }))}
        edited={t.edited}
        attachesPdf={!!def.attachesPdf}
        adminEmail={admin.user.email}
      />
    </>
  );
}
