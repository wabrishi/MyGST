"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Single-series monthly taxable sales for the financial year (Apr–Mar). Values in rupees. */
export function SalesChart({ data }: { data: Array<{ month: string; sales: number }> }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Monthly taxable sales for the financial year">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickFormatter={(v: number) => compact.format(v)}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            formatter={(v) => [full.format(Number(v)), "Taxable sales"]}
            contentStyle={{ borderRadius: 6, border: "1px solid var(--border)", fontSize: 12 }}
          />
          <Bar dataKey="sales" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
