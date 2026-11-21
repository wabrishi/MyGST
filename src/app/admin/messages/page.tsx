import { Inbox, Mail } from "lucide-react";
import Link from "next/link";
import { SearchBox } from "@/components/search-box";
import { Badge, Card, cn, Empty, FilterPills, PageHeader } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { formatMobile } from "@/lib/phone";
import { CONTACT_TOPICS } from "@/lib/site";
import { DeleteMessageButton, MarkReadButton } from "./messages-client";

export const metadata = { title: "Messages" };

const TOPIC_LABEL = Object.fromEntries(CONTACT_TOPICS.map((t) => [t.value, t.label])) as Record<string, string>;
const when = (d: Date) => d.toISOString().replace("T", " ").slice(0, 16) + " UTC";

/** Website contact messages: list on the left, the selected message on the right. */
export default async function AdminMessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  await requireAdmin("messages.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const filter = sp.filter === "unread" ? "unread" : "";
  const where: Prisma.ContactMessageWhereInput = {
    ...(filter === "unread" && { readAt: null }),
    ...(q && { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }, { company: { contains: q } }, { message: { contains: q } }] }),
  };
  const [messages, unread] = await Promise.all([db.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }), db.contactMessage.count({ where: { readAt: null } })]);
  const selectedId = typeof sp.id === "string" ? sp.id : messages[0]?.id;
  const selected = selectedId ? await db.contactMessage.findUnique({ where: { id: selectedId } }) : null;

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(filter && { filter }), ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `/admin/messages?${s}` : "/admin/messages";
  };

  return (
    <>
      <PageHeader title="Messages" subtitle={`From the website's Contact page · ${unread} unread`} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search name, email, message" />
        <FilterPills
          active={filter}
          items={[
            { value: "", label: "All", href: qs({ filter: "", id: "" }) },
            { value: "unread", label: `Unread (${unread})`, href: qs({ filter: "unread", id: "" }) },
          ]}
        />
      </div>

      {messages.length === 0 ? (
        <Card>
          <Empty icon={Inbox} title={q || filter ? "No messages match" : "No messages yet"}>
            Messages sent from the website&apos;s Contact page appear here, and are emailed to CONTACT_EMAIL.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card className="overflow-hidden">
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {messages.map((m) => (
                <li key={m.id}>
                  <Link
                    href={qs({ id: m.id })}
                    aria-current={m.id === selected?.id ? "true" : undefined}
                    className={cn("block px-4 py-3 hover:bg-subtle", m.id === selected?.id && "bg-primary-soft")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", !m.readAt ? "font-semibold" : "font-medium")}>{m.name}</span>
                      <span className="shrink-0 text-[11px] text-muted">{m.createdAt.toISOString().slice(0, 10)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      {!m.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                      <span className="truncate text-xs text-muted">{m.message}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {selected ? (
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{selected.name}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                    <a href={`mailto:${selected.email}`} className="text-primary hover:underline">
                      {selected.email}
                    </a>
                    {selected.phone && (
                      <span>
                        ·{" "}
                        <a href={`tel:${selected.phone}`} className="text-primary hover:underline">
                          {formatMobile(selected.phone)}
                        </a>
                      </span>
                    )}
                    {selected.company && <span>· {selected.company}</span>}
                  </div>
                </div>
                <Badge color="blue">{TOPIC_LABEL[selected.topic] ?? selected.topic}</Badge>
              </div>
              <p className="mt-5 whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-2 p-4 text-sm leading-relaxed">{selected.message}</p>
              <p className="mt-3 text-xs text-muted">
                Received {when(selected.createdAt)}
                {selected.ip && ` · from ${selected.ip}`}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <a
                  href={`mailto:${selected.email}?subject=${encodeURIComponent("Re: your message to MyGSTBook")}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  <Mail size={14} /> Reply by email
                </a>
                <MarkReadButton id={selected.id} read={!!selected.readAt} />
                <DeleteMessageButton id={selected.id} backHref={qs({ id: "" })} />
              </div>
            </Card>
          ) : (
            <Card>
              <Empty icon={Inbox} title="Message not found" />
            </Card>
          )}
        </div>
      )}
    </>
  );
}
