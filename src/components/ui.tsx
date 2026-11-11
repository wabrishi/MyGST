import { clsx, type ClassValue } from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent",
  secondary: "bg-surface text-foreground hover:bg-background border-border",
  ghost: "bg-transparent text-foreground hover:bg-black/5 border-transparent",
  danger: "bg-danger text-white hover:bg-danger/90 border-transparent",
};
const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-md border px-3 h-9 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cn(btnBase, VARIANTS[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(btnBase, VARIANTS[variant], className)} {...props} />;
}

const fieldBase =
  "w-full rounded-md border border-border bg-surface px-2.5 h-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "pr-7", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "h-auto py-2 min-h-16", className)} {...props} />;
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
    <div className={cn("flex flex-col gap-1", className)}>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">
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
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)} {...props} />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  gray: "bg-black/5 text-muted",
  green: "bg-success/10 text-success",
  red: "bg-danger/10 text-danger",
  amber: "bg-warning/10 text-warning",
  blue: "bg-primary/10 text-primary",
};

export function Badge({ color = "gray", children }: { color?: keyof typeof BADGE; children: ReactNode }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", BADGE[color])}>{children}</span>;
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("border-b border-border bg-background text-left text-xs font-medium text-muted", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-border", className)} {...props} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-muted">{children}</div>;
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info" | "warning"; children: ReactNode }) {
  const cls = {
    error: "border-danger/30 bg-danger/5 text-danger",
    success: "border-success/30 bg-success/5 text-success",
    info: "border-primary/30 bg-primary/5 text-primary",
    warning: "border-warning/30 bg-warning/5 text-warning",
  }[kind];
  return <div className={cn("rounded-md border px-3 py-2 text-sm", cls)}>{children}</div>;
}
