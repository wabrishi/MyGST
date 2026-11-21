import Link from "next/link";
import { cn } from "./ui";

/** MyGSTBook logo mark: an open ledger book with a rupee sign on an indigo tile. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M6.5 9.5c3.2-.9 6.3-.6 9.5 1.3v13.4c-3.2-1.9-6.3-2.2-9.5-1.3z" fill="#fff" opacity=".96" />
      <path d="M25.5 9.5c-3.2-.9-6.3-.6-9.5 1.3v13.4c3.2-1.9 6.3-2.2 9.5-1.3z" fill="#fff" opacity=".82" />
      <path
        d="M18.6 13.4h4.3M18.6 15.3h4.3M20.1 13.4c1.3 0 2.1.7 2.1 1.9s-.8 1.9-2.1 1.9h-1.5l3.1 2.9"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 13.6h4.6M9 15.8h4.6M9 18h3.2" stroke="var(--primary)" strokeOpacity=".45" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** The wordmark: My·GST·Book. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[17px] font-semibold tracking-tight", className)}>
      My<span className="text-primary">GST</span>Book
    </span>
  );
}

export function Logo({ href = "/", className, size = 28 }: { href?: string; className?: string; size?: number }) {
  return (
    <Link href={href} aria-label="MyGSTBook home" className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      <LogoMark size={size} />
      <Wordmark />
    </Link>
  );
}
