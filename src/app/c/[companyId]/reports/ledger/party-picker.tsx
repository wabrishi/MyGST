"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";

export function PartyPicker({ parties, value }: { parties: Array<{ id: string; name: string }>; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Select
      value={value}
      aria-label="Party"
      onChange={(e) => {
        const next = new URLSearchParams(params);
        next.set("party", e.target.value);
        router.replace(`${pathname}?${next}`);
      }}
    >
      <option value="">Select party…</option>
      {parties.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}
