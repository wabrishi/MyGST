"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui";
import { chooseFy } from "./fy-actions";

export function FySwitcher({ companyId, fys, selected, lockedUntil }: { companyId: string; fys: string[]; selected: string; lockedUntil: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isClosed = (fy: string) => !!lockedUntil && `20${fy.slice(3)}-03-31` <= lockedUntil;
  return (
    <Select
      value={selected}
      disabled={pending}
      aria-label="Financial year"
      title="Financial year"
      className="h-8 w-auto min-w-36 text-[13px] font-medium"
      onChange={(e) => {
        const fy = e.target.value;
        start(async () => {
          await chooseFy(companyId, fy);
          // Drop any explicit ?from&to so lists fall back to the newly selected year.
          router.replace(window.location.pathname);
          router.refresh();
        });
      }}
    >
      {fys.map((fy) => (
        <option key={fy} value={fy}>
          FY 20{fy}
          {isClosed(fy) ? " (closed)" : ""}
        </option>
      ))}
    </Select>
  );
}
