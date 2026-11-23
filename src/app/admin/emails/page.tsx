import { Mail } from "lucide-react";
import Link from "next/link";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { TEMPLATES } from "@/lib/email-templates";
import { mailEnabled } from "@/lib/mail";

export const metadata = { title: "Emails" };

/** Admin → Emails: every email the platform sends, and whether it has been edited. */
export default async function AdminEmailsPage() {
  await requireAdmin("emails.manage");
  const edited = new Map((await db.emailTemplate.findMany({ select: { key: true, updatedAt: true, updatedBy: true } })).map((t) => [t.key, t]));
  return (
    <>
      <PageHeader
        title="Emails"
        subtitle={mailEnabled() ? "Edit the wording of the emails MyGSTBook sends. Changes apply straight away." : "Edit the emails MyGSTBook sends. Email isn't configured yet (SMTP_HOST), so emails are printed in the server log."}
      />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Email</Th>
              <Th>When it&apos;s sent</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATES.map((t) => {
              const e = edited.get(t.key);
              return (
                <tr key={t.key}>
                  <Td>
                    <Link href={`/admin/emails/${t.key}`} className="inline-flex items-center gap-2 font-medium text-primary hover:underline">
                      <Mail size={15} /> {t.label}
                    </Link>
                  </Td>
                  <Td className="max-w-md text-sm text-muted">{t.description}</Td>
                  <Td>
                    {e ? (
                      <span title={`Edited by ${e.updatedBy ?? "an admin"}`}>
                        <Badge color="blue">Edited {e.updatedAt.toISOString().slice(0, 10)}</Badge>
                      </span>
                    ) : (
                      <Badge>Default</Badge>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
