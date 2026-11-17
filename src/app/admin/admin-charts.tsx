"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Single-series column chart for the admin overview. Same mark specs as the company dashboard
 * (≤ 24px columns, 4px rounded data-ends, hairline grid, text in text tokens). One series, so one
 * validated token (--series-1) and no legend box: the card title names the series.
 */

export interface ColumnPoint {
  key: string;
  label: string;
  value: number;
}

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("en-IN");

export function ColumnTrend({ data, name, money = false, label }: { data: ColumnPoint[]; name: string; money?: boolean; label: string }) {
  const fmt = (v: number) => (money ? inr.format(v) : count.format(v));
  return (
    <div className="h-56 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis
            tickLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            width={44}
            allowDecimals={false}
            tickFormatter={(v: number) => compact.format(v)}
          />
          <Tooltip
            cursor={{ fill: "var(--subtle)" }}
            content={(p) =>
              p.active && p.payload?.length ? (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop">
                  <div className="mb-1 font-medium text-muted">{String(p.label ?? "")}</div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--series-1)]" aria-hidden />
                    <span className="tabular font-semibold text-foreground">{fmt(Number(p.payload[0].value ?? 0))}</span>
                    <span className="text-muted">{name}</span>
                  </div>
                </div>
              ) : null
            }
          />
          <Bar isAnimationActive={false} dataKey="value" name={name} fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
