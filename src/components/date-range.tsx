"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthRange, todayIST } from "@/lib/gst/fy";
import { Input, Select } from "./ui";

function presets(fy: [string, string]): Array<[string, [string, string]]> {
  const today = todayIST();
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const prevMonthDate = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}-01`;
  const sy = Number(fy[0].slice(0, 4));
  const label = `FY ${sy}-${String(sy + 1).slice(2)}`;
  return [
    ["This month", monthRange(today)],
    ["Last month", monthRange(prevMonthDate)],
    [label, fy],
    [`${label} Q1 (Apr–Jun)`, [`${sy}-04-01`, `${sy}-06-30`]],
    [`${label} Q2 (Jul–Sep)`, [`${sy}-07-01`, `${sy}-09-30`]],
    [`${label} Q3 (Oct–Dec)`, [`${sy}-10-01`, `${sy}-12-31`]],
    [`${label} Q4 (Jan–Mar)`, [`${sy + 1}-01-01`, `${sy + 1}-03-31`]],
  ];
}

/** Date range picker synced to ?from&to. `fy` is the selected financial year's range. */
export function DateRangeFilter({ from, to, fy }: { from: string; to: string; fy: [string, string] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (f: string, t: string) => {
    const next = new URLSearchParams(params);
    next.set("from", f);
    next.set("to", t);
    next.delete("page");
    router.replace(`${pathname}?${next}`);
  };
  const list = presets(fy);
  const current = list.find(([, [f, t]]) => f === from && t === to)?.[0] ?? "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        className="w-48"
        value={current}
        aria-label="Period"
        onChange={(e) => {
          const p = list.find(([l]) => l === e.target.value);
          if (p) go(...p[1]);
        }}
      >
        <option value="">Custom</option>
        {list.map(([l]) => (
          <option key={l}>{l}</option>
        ))}
      </Select>
      <Input type="date" className="w-36" value={from} onChange={(e) => e.target.value && go(e.target.value, to)} aria-label="From" />
      <span className="text-muted">to</span>
      <Input type="date" className="w-36" value={to} onChange={(e) => e.target.value && go(from, e.target.value)} aria-label="To" />
    </div>
  );
}
