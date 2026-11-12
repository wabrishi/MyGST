import { clsx, type ClassValue } from "clsx";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// ───────────────────────── Buttons ─────────────────────────

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground border-transparent shadow-xs hover:bg-primary-hover",
  secondary: "bg-surface text-foreground border-border shadow-xs hover:bg-subtle hover:border-border-strong",
  ghost: "bg-transparent text-foreground border-transparent hover:bg-subtle",
  danger: "bg-danger text-white border-transparent shadow-xs hover:opacity-90",
  soft: "bg-primary-soft text-primary border-transparent hover:bg-primary/15",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2 rounded-lg",
};
const btnBase =
  "inline-flex items-center justify-center border font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,opacity] duration-150 disabled:opacity-50 disabled:pointer-events-none [&_svg]:shrink-0";

type BtnProps = { variant?: Variant; size?: Size };

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & BtnProps) {
  return <button className={cn(btnBase, SIZES[size], VARIANTS[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & BtnProps) {
  return <Link className={cn(btnBase, SIZES[size], VARIANTS[variant], className)} {...props} />;
}

// ───────────────────────── Form fields ─────────────────────────

const fieldBase =
  "w-full rounded-lg border border-border bg-surface px-3 h-9 text-sm text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "field-select pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "h-auto min-h-20 py-2 leading-relaxed", className)} {...props} />;
}

export function Field({
  label,
  error,
  hint,
  className,
  children,
  required,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-foreground/85">
          {label}
          {required && (
            <span className="text-danger" aria-hidden>
              {" "}
              *
            </span>
          )}
        </span>
        {children}
      </label>
      {error ? <span className="text-xs font-medium text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

// ───────────────────────── Surfaces ─────────────────────────

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-border bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">{eyebrow}</div>}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Toolbar row above lists (search, filters). */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mb-4 flex flex-wrap items-center gap-3", className)}>{children}</div>;
}

/** Segmented filter pills (links). */
export function FilterPills({ items, active }: { items: Array<{ href: string; label: string; value: string }>; active: string }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 shadow-xs">
      {items.map((i) => (
        <Link
          key={i.value}
          href={i.href}
          className={cn(
            "rounded-md px-3 py-1 text-[13px] font-medium transition-colors",
            active === i.value ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

// ───────────────────────── Data display ─────────────────────────

const BADGE: Record<string, string> = {
  gray: "bg-subtle text-muted ring-border",
  green: "bg-success-soft text-success ring-success/20",
  red: "bg-danger-soft text-danger ring-danger/20",
  amber: "bg-warning-soft text-warning ring-warning/25",
  blue: "bg-primary-soft text-primary ring-primary/20",
};

export function Badge({ color = "gray", children, dot = true }: { color?: keyof typeof BADGE; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", BADGE[color])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn(
          "w-full border-collapse text-sm [&_td]:px-4 [&_td]:py-2.5 [&_th]:px-4 [&_th]:py-2.5 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-surface-2",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn("sticky top-0 border-b border-border bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-muted", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-border/70", className)} {...props} />;
}

export function Empty({
  children,
  icon: Icon,
  title,
  action,
}: {
  children?: ReactNode;
  icon?: LucideIcon;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {Icon && (
        <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Icon size={20} />
        </div>
      )}
      {title && <div className="text-[15px] font-semibold">{title}</div>}
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const ALERT = {
  error: { cls: "border-danger/25 bg-danger-soft text-danger", icon: XCircle },
  success: { cls: "border-success/25 bg-success-soft text-success", icon: CheckCircle2 },
  info: { cls: "border-info/25 bg-info-soft text-info", icon: Info },
  warning: { cls: "border-warning/30 bg-warning-soft text-warning", icon: AlertTriangle },
} as const;

export function Alert({ kind = "error", children }: { kind?: keyof typeof ALERT; children: ReactNode }) {
  const { cls, icon: Icon } = ALERT[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm", cls)}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 [&_a]:font-medium [&_a]:underline">{children}</div>
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full bg-primary-soft font-semibold text-primary ring-1 ring-primary/15"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-subtle", className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-surface/60 to-transparent" />
    </div>
  );
}

/** ▲/▼ percentage chip. `goodWhenUp` flips colours for metrics where a fall is good (e.g. overdue). */
export function Trend({ pct, goodWhenUp = true, label = "vs last month" }: { pct: number | null; goodWhenUp?: boolean; label?: string }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  const good = up === goodWhenUp;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-flex items-center rounded px-1 py-px text-[11px] font-semibold", good ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
        {up ? "▲" : "▼"} {Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%
      </span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

/** Compact KPI tile for secondary metrics. */
export function MiniStat({ label, value, hint, icon: Icon, href }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; href?: string }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
        {Icon && <Icon size={14} className="shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="tabular mt-1.5 text-lg font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted">{hint}</div>}
    </>
  );
  const cls = "block rounded-xl border border-border bg-surface px-4 py-3.5 shadow-card";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-primary/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  const toneCls = { blue: "bg-primary-soft text-primary", green: "bg-success-soft text-success", amber: "bg-warning-soft text-warning", red: "bg-danger-soft text-danger" }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-medium text-muted">{label}</div>
        {Icon && (
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneCls)}>
            <Icon size={16} />
          </div>
        )}
      </div>
      <div className="tabular mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}
