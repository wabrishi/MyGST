import {
  ActionButton,
  ActionForm,
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmAction,
  Empty,
  Field,
  FilterPills,
  Grid,
  Hidden,
  Input,
  Pager,
  Section,
  Select,
  Stat,
  Table,
  Td,
  Textarea,
  Th,
  type PageProps,
  type PluginContext,
} from "@/lib/plugins/sdk";
import { activities, leads } from "./actions";
import { ACTIVITY_LABEL, canSee, DEFAULT_SOURCES, inr, isClosed, LOST, parseList, stagesFrom, todayIST, visibleWhere, WON, type ActivityRecord, type LeadRecord } from "./model";

const PAGE = 25;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

function StageBadge({ stage }: { stage: string }) {
  return <Badge color={stage === WON ? "green" : stage === LOST ? "red" : "blue"}>{stage}</Badge>;
}

function DueBadge({ due, today }: { due: string; today: string }) {
  if (!due) return <span className="text-muted">—</span>;
  if (due < today) return <Badge color="red">Overdue · {due}</Badge>;
  if (due === today) return <Badge color="amber">Today</Badge>;
  return <span className="tabular">{due}</span>;
}

// ───────────────────────── Pipeline ─────────────────────────

export async function PipelinePage({ ctx }: PageProps) {
  const { open } = stagesFrom(ctx.settings);
  const scope = visibleWhere(ctx);
  const today = todayIST();
  const canMove = ctx.can("leads.manage");
  const columns = await Promise.all(
    open.map(async (stage) => ({
      stage,
      rows: await leads(ctx).find({ where: { ...scope, stage }, orderBy: "-value", limit: 50 }),
      count: await leads(ctx).count({ ...scope, stage }),
      value: await leads(ctx).sum("value", { ...scope, stage }),
    })),
  );
  const [won, lost, wonValue] = await Promise.all([leads(ctx).count({ ...scope, stage: WON }), leads(ctx).count({ ...scope, stage: LOST }), leads(ctx).sum("value", { ...scope, stage: WON })]);
  const openValue = columns.reduce((t, c) => t + c.value, 0);
  const openCount = columns.reduce((t, c) => t + c.count, 0);
  const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Move leads through your stages. Values are expected deal sizes.</p>
        {canMove && <ButtonLink href={ctx.pageUrl("leads", "new")}>+ New lead</ButtonLink>}
      </div>
      <Grid cols={4}>
        <Stat label="Open leads" value={openCount} hint={inr(openValue) + " in the pipeline"} />
        <Stat label="Won" value={won} hint={inr(wonValue)} />
        <Stat label="Lost" value={lost} />
        <Stat label="Win rate" value={winRate === null ? "—" : `${winRate}%`} hint="Won ÷ (won + lost)" />
      </Grid>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((c) => (
          <section key={c.stage} aria-label={c.stage} className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-surface-2">
            <header className="flex items-baseline justify-between border-b border-border px-3 py-2.5">
              <h3 className="text-sm font-semibold">
                {c.stage} <span className="font-normal text-muted">· {c.count}</span>
              </h3>
              <span className="tabular text-xs text-muted">{inr(c.value)}</span>
            </header>
            <div className="flex flex-col gap-2 p-2">
              {c.rows.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted">No leads</p>}
              {c.rows.map((l) => (
                <article key={l.id} className="rounded-lg border border-border bg-surface p-3 text-sm shadow-xs">
                  <a href={ctx.pageUrl("leads", l.id)} className="font-medium hover:text-primary">
                    {l.name}
                  </a>
                  {l.company && <div className="truncate text-xs text-muted">{l.company}</div>}
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="tabular font-medium">{inr(l.value)}</span>
                    {l.nextFollowUp && <DueBadge due={l.nextFollowUp} today={today} />}
                  </div>
                  {canMove && (
                    <div className="mt-2 flex items-center justify-between gap-1">
                      {open.indexOf(c.stage) > 0 ? (
                        <ActionButton ctx={ctx} action="moveStage" values={{ id: l.id, dir: "prev" }} title={`Move ${l.name} back`}>
                          ◀
                        </ActionButton>
                      ) : (
                        <span />
                      )}
                      <ActionButton ctx={ctx} action="moveStage" values={{ id: l.id, stage: WON }} variant="soft" title={`Mark ${l.name} as won`}>
                        Won
                      </ActionButton>
                      {open.indexOf(c.stage) < open.length - 1 ? (
                        <ActionButton ctx={ctx} action="moveStage" values={{ id: l.id, dir: "next" }} title={`Move ${l.name} forward`}>
                          ▶
                        </ActionButton>
                      ) : (
                        <span />
                      )}
                    </div>
                  )}
                </article>
              ))}
              {c.count > c.rows.length && (
                <a href={`${ctx.pageUrl("leads")}?stage=${encodeURIComponent(c.stage)}`} className="px-1 text-xs text-primary hover:underline">
                  See all {c.count}
                </a>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

// ───────────────────────── Leads ─────────────────────────

export async function LeadsPage(props: PageProps) {
  const [first, second] = props.path;
  if (first === "new") return <LeadForm ctx={props.ctx} />;
  if (first) {
    const lead = await leads(props.ctx).get(first);
    if (!lead || !canSee(props.ctx, lead)) return <Empty title="Lead not found">It may have been deleted, or it belongs to someone else.</Empty>;
    if (second === "edit") return <LeadForm ctx={props.ctx} lead={lead} />;
    return <LeadDetail ctx={props.ctx} lead={lead} />;
  }
  return <LeadList {...props} />;
}

async function LeadList({ ctx, searchParams }: PageProps) {
  const { all } = stagesFrom(ctx.settings);
  const q = one(searchParams.q).trim().toLowerCase();
  const stage = one(searchParams.stage);
  const owner = ctx.can("leads.viewAll") ? one(searchParams.owner) : "";
  const page = Math.max(1, Number(one(searchParams.page)) || 1);
  const today = todayIST();
  const where = {
    ...visibleWhere(ctx),
    ...(q && { search: { contains: q } }),
    ...(all.includes(stage) && { stage }),
    ...(owner && { ownerId: owner }),
  };
  const rows = await leads(ctx).find({ where, limit: PAGE + 1, offset: (page - 1) * PAGE });
  const members = ctx.can("leads.viewAll") ? await ctx.data.members().catch(() => []) : [];
  const base = ctx.pageUrl("leads");
  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(stage && { stage }), ...(owner && { owner }), ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <form method="get" action={base} className="flex flex-wrap items-center gap-2">
          {stage && <Hidden name="stage" value={stage} />}
          <Input name="q" defaultValue={q} placeholder="Search name, company, phone, email" aria-label="Search leads" className="w-64" />
          {members.length > 1 && (
            <Select name="owner" defaultValue={owner} aria-label="Owner" className="w-44">
              <option value="">Everyone</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
          <Button variant="secondary">Search</Button>
        </form>
        {ctx.can("leads.manage") && (
          <ButtonLink href={ctx.pageUrl("leads", "new")} className="ml-auto">
            + New lead
          </ButtonLink>
        )}
      </div>
      <div className="mb-3">
        <FilterPills active={stage} items={[{ value: "", label: "All", href: href({ stage: "", page: "" }) }, ...all.map((s) => ({ value: s, label: s, href: href({ stage: s, page: "" }) }))]} />
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty title={q || stage ? "No leads match" : "No leads yet"}>Add your first lead to start tracking enquiries, follow-ups and deals.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Lead</Th>
                <Th>Stage</Th>
                <Th className="text-right">Value</Th>
                <Th>Owner</Th>
                <Th>Next follow-up</Th>
                <Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE).map((l) => (
                <tr key={l.id}>
                  <Td>
                    <a href={ctx.pageUrl("leads", l.id)} className="font-medium text-primary hover:underline">
                      {l.name}
                    </a>
                    {l.company && <div className="text-xs text-muted">{l.company}</div>}
                  </Td>
                  <Td>
                    <StageBadge stage={l.stage} />
                  </Td>
                  <Td className="tabular text-right">{inr(l.value)}</Td>
                  <Td>{l.ownerName || "—"}</Td>
                  <Td>{isClosed(l.stage) ? <span className="text-muted">—</span> : <DueBadge due={l.nextFollowUp} today={today} />}</Td>
                  <Td>{l.source || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={page} hasMore={rows.length > PAGE} href={(p) => href({ page: String(p) })} />
      </Card>
    </>
  );
}

async function LeadForm({ ctx, lead }: { ctx: PluginContext; lead?: LeadRecord }) {
  if (!ctx.can("leads.manage")) return <Empty title="You can't edit leads">Ask an owner for the &quot;Create and edit leads&quot; permission.</Empty>;
  const sources = parseList(ctx.settings.sources, DEFAULT_SOURCES);
  const members = ctx.can("leads.viewAll") ? await ctx.data.members().catch(() => []) : [];
  const v = lead;
  return (
    <Card className="max-w-3xl p-5">
      <ActionForm ctx={ctx} action={lead ? "updateLead" : "createLead"} className="grid gap-4 sm:grid-cols-2">
        {lead && <Hidden name="id" value={lead.id} />}
        <Field label="Contact name">
          <Input name="name" required maxLength={120} defaultValue={v?.name} autoFocus={!lead} />
        </Field>
        <Field label="Business name">
          <Input name="company" maxLength={120} defaultValue={v?.company} />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" maxLength={30} defaultValue={v?.phone} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" maxLength={150} defaultValue={v?.email} />
        </Field>
        <Field label="GSTIN" hint="Optional. Used when you convert the lead to a customer.">
          <Input name="gstin" maxLength={15} defaultValue={v?.gstin} className="uppercase" />
        </Field>
        <Field label="Expected deal value (₹)">
          <Input name="value" type="number" min={0} step="0.01" defaultValue={v?.value ?? ""} />
        </Field>
        <Field label="Source">
          <Select name="source" defaultValue={v?.source ?? ""}>
            <option value="">—</option>
            {sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        {members.length > 0 && (
          <Field label="Owner">
            <Select name="ownerId" defaultValue={v?.ownerId ?? ctx.user?.id ?? ""}>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {!lead && (
          <>
            <Field label="First follow-up" hint="Optional">
              <Input name="followUp" type="date" min={todayIST()} />
            </Field>
            <Field label="Follow-up note">
              <Input name="followUpNote" maxLength={300} placeholder="Call to discuss requirements" />
            </Field>
          </>
        )}
        <div className="sm:col-span-2">
          <Field label="Notes">
            <Textarea name="notes" maxLength={2000} defaultValue={v?.notes} />
          </Field>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button>{lead ? "Save lead" : "Create lead"}</Button>
          <ButtonLink variant="secondary" href={lead ? ctx.pageUrl("leads", lead.id) : ctx.pageUrl("leads")}>
            Cancel
          </ButtonLink>
        </div>
      </ActionForm>
    </Card>
  );
}

async function LeadDetail({ ctx, lead }: { ctx: PluginContext; lead: LeadRecord }) {
  const { all } = stagesFrom(ctx.settings);
  const today = todayIST();
  const timeline = await activities(ctx).find({ where: { leadId: lead.id }, limit: 200 });
  const openFollowUps = timeline.filter((a) => a.kind === "followup" && a.open === "yes").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const manage = ctx.can("leads.manage");
  const convert = ctx.can("leads.convert");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {lead.name} {lead.company && <span className="font-normal text-muted">· {lead.company}</span>}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <StageBadge stage={lead.stage} />
            <span className="tabular font-medium">{inr(lead.value)}</span>
            <span className="text-muted">· Owner {lead.ownerName || "—"}</span>
            {lead.source && <span className="text-muted">· {lead.source}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink variant="secondary" size="sm" href={ctx.pageUrl("leads")}>
            ← All leads
          </ButtonLink>
          {manage && (
            <ButtonLink variant="secondary" size="sm" href={ctx.pageUrl("leads", lead.id, "edit")}>
              Edit
            </ButtonLink>
          )}
          {ctx.can("leads.delete") && <ConfirmAction ctx={ctx} action="deleteLead" values={{ id: lead.id }} returnTo={ctx.pageUrl("leads", lead.id)} label="Delete" confirmLabel="Delete lead" />}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          {manage && (
            <Section title="Log activity">
              <ActionForm ctx={ctx} action="addActivity" className="grid gap-3 px-5 pb-5 sm:grid-cols-[150px_1fr]">
                <Hidden name="leadId" value={lead.id} />
                <Field label="Type">
                  <Select name="kind" defaultValue="note">
                    {(["note", "call", "email", "meeting", "followup"] as const).map((k) => (
                      <option key={k} value={k}>
                        {ACTIVITY_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="What happened / what's next">
                  <Input name="text" maxLength={2000} placeholder="Spoke to them about pricing…" />
                </Field>
                <Field label="Follow-up date" hint="For follow-ups">
                  <Input name="dueAt" type="date" />
                </Field>
                <div className="flex items-end">
                  <Button>Add</Button>
                </div>
              </ActionForm>
            </Section>
          )}

          <Section title="Timeline" description={`${timeline.length} entries`}>
            {timeline.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">Nothing yet.</p>
            ) : (
              <ol className="divide-y divide-border">
                {timeline.map((a: ActivityRecord) => (
                  <li key={a.id} className="flex gap-3 px-5 py-3 text-sm">
                    <span className="w-20 shrink-0 text-xs font-medium text-muted">{ACTIVITY_LABEL[a.kind] ?? a.kind}</span>
                    <div className="min-w-0 flex-1">
                      <div className="whitespace-pre-wrap break-words">{a.text}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {a.byName} · {a.createdAt.slice(0, 10)}
                        {a.kind === "followup" && ` · due ${a.dueAt}${a.open === "yes" ? "" : " · done"}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div>
          <Section title="Contact">
            <dl className="grid gap-2 px-5 pb-5 text-sm">
              <div>
                <dt className="text-xs text-muted">Phone</dt>
                <dd>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Email</dt>
                <dd className="break-all">{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">GSTIN</dt>
                <dd className="font-mono text-xs">{lead.gstin || "—"}</dd>
              </div>
              {lead.notes && (
                <div>
                  <dt className="text-xs text-muted">Notes</dt>
                  <dd className="whitespace-pre-wrap">{lead.notes}</dd>
                </div>
              )}
            </dl>
          </Section>

          {manage && (
            <Section title="Stage">
              <div className="flex flex-col gap-3 px-5 pb-5">
                <ActionForm ctx={ctx} action="moveStage" className="flex gap-2">
                  <Hidden name="id" value={lead.id} />
                  <Select name="stage" defaultValue={lead.stage} aria-label="Stage">
                    {all.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                  <Button variant="secondary">Move</Button>
                </ActionForm>
                {!isClosed(lead.stage) && (
                  <ActionForm ctx={ctx} action="moveStage" className="flex gap-2">
                    <Hidden name="id" value={lead.id} />
                    <Hidden name="stage" value={LOST} />
                    <Input name="reason" placeholder="Why was it lost?" maxLength={300} aria-label="Reason lost" />
                    <Button variant="secondary">Lost</Button>
                  </ActionForm>
                )}
                {lead.lostReason && <p className="text-xs text-muted">Lost because: {lead.lostReason}</p>}
              </div>
            </Section>
          )}

          <Section title="Follow-ups" description={openFollowUps.length ? `${openFollowUps.length} open` : "None open"}>
            <ul className="divide-y divide-border">
              {openFollowUps.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <DueBadge due={f.dueAt} today={today} />
                    <div className="truncate text-xs text-muted">{f.text}</div>
                  </div>
                  {manage && (
                    <ActionButton ctx={ctx} action="completeFollowUp" values={{ id: f.id }}>
                      Done
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Customer & quotations">
            <div className="flex flex-col gap-3 px-5 pb-5 text-sm">
              {lead.partyId ? (
                <p>
                  Customer:{" "}
                  <a href={ctx.companyUrl(`parties/${lead.partyId}`)} className="font-medium text-primary hover:underline">
                    open in MyGST
                  </a>
                </p>
              ) : convert ? (
                <ActionButton ctx={ctx} action="convertLead" values={{ id: lead.id }} variant="primary" size="md">
                  Convert to customer
                </ActionButton>
              ) : (
                <p className="text-muted">Not a customer yet.</p>
              )}
              {lead.quotations.length > 0 && (
                <ul className="list-disc pl-5">
                  {lead.quotations.map((q) => (
                    <li key={q.id}>
                      <a href={ctx.companyUrl(`quotations/${q.id}`)} className="text-primary hover:underline">
                        {q.number}
                      </a>{" "}
                      <span className="tabular text-muted">{inr(q.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {lead.partyId && convert && (
                <>
                  <ActionForm ctx={ctx} action="quickQuotation" className="grid grid-cols-2 gap-2">
                    <Hidden name="id" value={lead.id} />
                    <div className="col-span-2">
                      <Field label="Quick quotation: item">
                        <Input name="item" required maxLength={300} placeholder="Annual maintenance contract" />
                      </Field>
                    </div>
                    <Field label="Qty">
                      <Input name="qty" type="number" min={0.001} step="any" defaultValue={1} />
                    </Field>
                    <Field label="Rate (₹)">
                      <Input name="rate" type="number" min={0} step="0.01" required defaultValue={lead.value || ""} />
                    </Field>
                    <Field label="GST %">
                      <Select name="gstRate" defaultValue="18">
                        {["0", "5", "12", "18", "28"].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </Select>
                    </Field>
                    <div className="flex items-end">
                      <Button variant="secondary">Create quotation</Button>
                    </div>
                  </ActionForm>
                  <a href={ctx.companyUrl(`quotations/new?party=${lead.partyId}`)} className="text-xs text-primary hover:underline">
                    Open the full quotation form →
                  </a>
                </>
              )}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

// ───────────────────────── Follow-ups ─────────────────────────

async function dueFollowUps(ctx: PluginContext, until: string, onlyMine: boolean) {
  const mine = onlyMine || !ctx.can("leads.viewAll");
  const rows = await activities(ctx).find({ where: { kind: "followup", open: "yes", dueAt: { lte: until } }, orderBy: "dueAt", limit: 500 });
  const visible = rows.filter((a) => !mine || !ctx.user || a.ownerId === ctx.user.id);
  const ids = [...new Set(visible.map((a) => a.leadId))];
  const byId = new Map((ids.length ? await leads(ctx).find({ where: { id: { in: ids } }, limit: 500 }) : []).map((l) => [l.id, l]));
  return visible.flatMap((a) => {
    const lead = byId.get(a.leadId);
    return lead && !isClosed(lead.stage) ? [{ a, lead }] : [];
  });
}

export async function FollowUpsPage({ ctx, searchParams }: PageProps) {
  const today = todayIST();
  const mine = one(searchParams.who) === "me";
  const items = await dueFollowUps(ctx, addDays(today, 7), mine);
  const groups = [
    { title: "Overdue", rows: items.filter((x) => x.a.dueAt < today) },
    { title: "Today", rows: items.filter((x) => x.a.dueAt === today) },
    { title: "Next 7 days", rows: items.filter((x) => x.a.dueAt > today) },
  ];
  const base = ctx.pageUrl("follow-ups");
  return (
    <>
      {ctx.can("leads.viewAll") && (
        <div className="mb-3">
          <FilterPills
            active={mine ? "me" : ""}
            items={[
              { value: "", label: "Everyone", href: base },
              { value: "me", label: "Mine", href: `${base}?who=me` },
            ]}
          />
        </div>
      )}
      {items.length === 0 && (
        <Card>
          <Empty title="You're all caught up">No follow-ups due in the next 7 days.</Empty>
        </Card>
      )}
      {groups
        .filter((g) => g.rows.length)
        .map((g) => (
          <Section key={g.title} title={g.title} description={`${g.rows.length}`}>
            <Table>
              <tbody>
                {g.rows.map(({ a, lead }) => (
                  <tr key={a.id}>
                    <Td className="w-36">
                      <DueBadge due={a.dueAt} today={today} />
                    </Td>
                    <Td>
                      <a href={ctx.pageUrl("leads", lead.id)} className="font-medium text-primary hover:underline">
                        {lead.name}
                      </a>
                      <div className="text-xs text-muted">{a.text}</div>
                    </Td>
                    <Td className="text-xs text-muted">{lead.ownerName}</Td>
                    <Td className="text-right">
                      {ctx.can("leads.manage") && (
                        <ActionButton ctx={ctx} action="completeFollowUp" values={{ id: a.id }}>
                          Done
                        </ActionButton>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>
        ))}
    </>
  );
}

// ───────────────────────── Dashboard widget ─────────────────────────

export async function TodayWidget({ ctx }: { ctx: PluginContext }) {
  const today = todayIST();
  const items = await dueFollowUps(ctx, today, true);
  if (!items.length) return <p className="text-sm text-muted">No follow-ups due today. </p>;
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {items.slice(0, 5).map(({ a, lead }) => (
        <li key={a.id} className="flex items-center justify-between gap-2">
          <a href={ctx.pageUrl("leads", lead.id)} className="truncate font-medium hover:text-primary">
            {lead.name}
          </a>
          <DueBadge due={a.dueAt} today={today} />
        </li>
      ))}
      {items.length > 5 && (
        <li>
          <a href={ctx.pageUrl("follow-ups")} className="text-xs text-primary hover:underline">
            {items.length - 5} more →
          </a>
        </li>
      )}
    </ul>
  );
}
