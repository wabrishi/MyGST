import Link from "next/link";
import { cn } from "./ui";

/** MyGST logo mark: an invoice sheet with a rupee glyph on an indigo tile. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M10 7.5h9.5L23 11v13.5H10z" fill="#fff" opacity=".96" />
      <path d="M19.5 7.5V11H23" fill="none" stroke="var(--primary)" strokeOpacity=".35" strokeWidth="1.2" />
      <path
        d="M13 13h6.5M13 15.6h6.5M15.2 13c1.9 0 3 .9 3 2.6s-1.1 2.6-3 2.6H13l4.6 4"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ href = "/", className, size = 28 }: { href?: string; className?: string; size?: number }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight text-foreground", className)}>
      <LogoMark size={size} />
      <span className="text-[17px]">
        My<span className="text-primary">GST</span>
      </span>
    </Link>
  );
}
