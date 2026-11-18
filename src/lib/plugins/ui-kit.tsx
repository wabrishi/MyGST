import { Puzzle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Alert, Avatar, Badge, Button, ButtonLink, Card, CardHeader, cn, Empty as CoreEmpty, Field, FilterPills, Input, MiniStat, Select, Table, Td, Textarea, Th, Toolbar } from "@/components/ui";
import type { PluginContext } from "./sdk";

/**
 * UI kit for plugin pages and widgets (exported from @/lib/plugins/sdk). These are MyGST's own
 * components, so plugin screens match the app in light and dark mode. They render on the server:
 * use <ActionForm> (a plain HTML form posting to an api.action handler) for anything that changes data.
 */

export { Alert, Avatar, Badge, Button, ButtonLink, Card, CardHeader, Field, FilterPills, Input, Select, Table, Td, Textarea, Th, Toolbar };

/** Compact number tile. */
export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  return <MiniStat label={label} value={value} hint={hint} href={href} />;
}

export function Empty({ title, children, action }: { title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <CoreEmpty icon={Puzzle} title={title} action={action}>
      {children}
    </CoreEmpty>
  );
}

/** A card with a heading row. */
export function Section({ title, description, actions, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("mb-4", className)}>
      <CardHeader title={title} description={description} actions={actions} />
      {children}
    </Card>
  );
}

/** A responsive row of tiles or cards. */
export function Grid({ cols = 3, children, className }: { cols?: 2 | 3 | 4; children: ReactNode; className?: string }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={cn("mb-4 grid gap-3", c, className)}>{children}</div>;
}

/**
 * A form that runs a plugin action (api.action(name, …)). After it runs, MyGST sends the user back to
 * `returnTo` (default: the page the form is on) with the action's message shown at the top.
 */
export function ActionForm({
  ctx,
  action,
  returnTo,
  children,
  className,
  ...props
}: { ctx: PluginContext; action: string; returnTo?: string; children: ReactNode; className?: string } & Omit<ComponentProps<"form">, "action" | "method">) {
  return (
    <form method="post" action={ctx.actionUrl(action)} className={className} {...props}>
      {returnTo && <input type="hidden" name="_returnTo" value={returnTo} />}
      {children}
    </form>
  );
}

/** Hidden form value. */
export function Hidden({ name, value }: { name: string; value: string | number | null | undefined }) {
  return <input type="hidden" name={name} value={value ?? ""} />;
}

/** One button that posts an action with a few hidden values (e.g. "Mark done", "Move ▶"). */
export function ActionButton({
  ctx,
  action,
  values = {},
  returnTo,
  children,
  variant = "secondary",
  size = "sm",
  title,
}: {
  ctx: PluginContext;
  action: string;
  values?: Record<string, string | number | null | undefined>;
  returnTo?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft";
  size?: "sm" | "md";
  title?: string;
}) {
  return (
    <ActionForm ctx={ctx} action={action} returnTo={returnTo} className="inline">
      {Object.entries(values).map(([k, v]) => (
        <Hidden key={k} name={k} value={v} />
      ))}
      <Button variant={variant} size={size} title={title} aria-label={title}>
        {children}
      </Button>
    </ActionForm>
  );
}

/** A destructive action behind a second click (works without JavaScript). */
export function ConfirmAction({
  ctx,
  action,
  values = {},
  returnTo,
  label,
  confirmLabel,
}: {
  ctx: PluginContext;
  action: string;
  values?: Record<string, string | number | null | undefined>;
  returnTo?: string;
  label: string;
  confirmLabel?: string;
}) {
  return (
    <details className="relative inline-block">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md border border-border px-2.5 text-xs font-medium text-danger hover:bg-danger-soft">{label}</summary>
      <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-border bg-surface p-3 text-xs shadow-lg">
        <p className="mb-2 text-muted">This can&apos;t be undone.</p>
        <ActionButton ctx={ctx} action={action} values={values} returnTo={returnTo} variant="danger">
          {confirmLabel ?? label}
        </ActionButton>
      </div>
    </details>
  );
}

/** Previous / next links for paged lists. */
export function Pager({ page, hasMore, href }: { page: number; hasMore: boolean; href: (page: number) => string }) {
  if (page <= 1 && !hasMore) return null;
  return (
    <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
      {page > 1 ? (
        <ButtonLink href={href(page - 1)} variant="secondary" size="sm">
          ← Previous
        </ButtonLink>
      ) : (
        <span />
      )}
      <span className="text-muted">Page {page}</span>
      {hasMore ? (
        <ButtonLink href={href(page + 1)} variant="secondary" size="sm">
          Next →
        </ButtonLink>
      ) : (
        <span />
      )}
    </div>
  );
}
