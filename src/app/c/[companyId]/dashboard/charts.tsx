"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Dashboard charts. Specs follow the dataviz guidance: columns ≤ 24px with 4px rounded data-ends,
 * 2px gap between adjacent bars, 2px lines, end-dots with a surface ring, hairline gridlines,
 * text in text tokens (never series colours). Series colours are validated theme tokens
 * (--series-1 / --series-2 in globals.css).
 */

import type { MonthRow } from "@/lib/reports/kpis";
export type { MonthRow };

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

const axisProps = {
  tickLine: false,
  tick: { fill: "var(--muted)", fontSize: 12 },
} as const;

type Series = { key: keyof MonthRow; name: string; color: string };

/** Tooltip: value leads (strong), series name follows; series keyed with a short line, not a box. */
type TipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>;
  label?: unknown;
  series: Series[];
};

function ChartTooltip({ active, payload, label, series }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-44 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs shadow-pop">
      <div className="mb-1.5 font-medium text-muted">{String(label ?? "")}</div>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p) return null;
        return (
          <div key={String(s.key)} className="flex items-center gap-2 py-0.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
            <span className="tabular font-semibold text-foreground">{inr.format(Number(p.value ?? 0))}</span>
            <span className="text-muted">{s.name}</span>
          </div>
        );
      })}
    </div>
  );
}

function Frame({ label, children, height = 260 }: { label: string; children: React.ReactElement; height?: number }) {
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Grouped columns: sales vs purchases per month (taxable value). */
export function SalesPurchasesChart({ data }: { data: MonthRow[] }) {
  const series: Series[] = [
    { key: "sales", name: "Sales", color: "var(--series-1)" },
    { key: "purchases", name: "Purchases", color: "var(--series-2)" },
  ];
  return (
    <Frame label="Monthly sales and purchases, taxable value">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="month" {...axisProps} axisLine={{ stroke: "var(--border)" }} />
        <YAxis {...axisProps} axisLine={false} width={48} tickFormatter={(v: number) => compact.format(v)} />
        <Tooltip cursor={{ fill: "var(--subtle)" }} content={(p) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} series={series} />} />
        {series.map((s) => (
          <Bar isAnimationActive={false} key={String(s.key)} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={24} />
        ))}
      </BarChart>
    </Frame>
  );
}

/** Two lines: invoiced (incl. GST) vs payments collected per month. */
export function CashFlowChart({ data }: { data: MonthRow[] }) {
  const series: Series[] = [
    { key: "invoiced", name: "Invoiced", color: "var(--series-1)" },
    { key: "collected", name: "Collected", color: "var(--series-2)" },
  ];
  return (
    <Frame label="Monthly invoiced value versus payments collected">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="month" {...axisProps} axisLine={{ stroke: "var(--border)" }} />
        <YAxis {...axisProps} axisLine={false} width={48} tickFormatter={(v: number) => compact.format(v)} />
        <Tooltip cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} content={(p) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} series={series} />} />
        {series.map((s) => (
          <Line
            isAnimationActive={false}
            key={String(s.key)}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            // Small dots keep sparse months readable; surface ring separates them from the other line.
            dot={{ r: 3, fill: s.color, stroke: "var(--surface)", strokeWidth: 1.5 }}
            activeDot={{ r: 4.5, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </Frame>
  );
}

/** Single series around a zero baseline: net GST payable (negative = excess ITC carried forward). */
export function NetGstChart({ data }: { data: MonthRow[] }) {
  return (
    <Frame label="Net GST payable per month">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="month" {...axisProps} axisLine={false} />
        <YAxis {...axisProps} axisLine={false} width={48} tickFormatter={(v: number) => compact.format(v)} />
        <ReferenceLine y={0} stroke="var(--border-strong)" />
        <Tooltip
          cursor={{ fill: "var(--subtle)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload as MonthRow;
            return (
              <div className="min-w-48 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs shadow-pop">
                <div className="mb-1.5 font-medium text-muted">{String(label ?? "")}</div>
                <div className="tabular text-sm font-semibold text-foreground">{inr.format(r.netGst ?? 0)}</div>
                <div className="text-muted">{(r.netGst ?? 0) < 0 ? "Excess ITC (carried forward)" : "Net payable"}</div>
                <div className="mt-1.5 border-t border-border pt-1.5 text-muted">
                  Output {inr.format(r.outputTax ?? 0)} · ITC {inr.format(r.itc ?? 0)}
                </div>
              </div>
            );
          }}
        />
        {/* Bars grow both ways from 0, so ends stay square (a rounded end would land on the baseline for negatives). */}
        <Bar isAnimationActive={false} dataKey="netGst" name="Net GST" maxBarSize={24}>
          {data.map((r) => (
            // One hue both directions; excess-ITC months are a lighter step of the same hue.
            <Cell key={r.month} fill="var(--series-1)" fillOpacity={(r.netGst ?? 0) < 0 ? 0.45 : 1} />
          ))}
        </Bar>
      </BarChart>
    </Frame>
  );
}
