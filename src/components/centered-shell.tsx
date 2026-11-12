import type { ReactNode } from "react";
import { Logo } from "./brand";
import { cn } from "./ui";

/** Branded frame for standalone pages (onboarding, company picker, invitations). */
export function CenteredShell({ children, width = "md" }: { children: ReactNode; width?: "sm" | "md" | "lg" }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-5">
          <Logo />
        </div>
      </header>
      <main className={cn("mx-auto w-full flex-1 px-5 py-12", { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }[width])}>{children}</main>
    </div>
  );
}
