import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui";

export type LegendItem = { label: string; color: string; kind: "rect" | "line" };

/** Legend mirrors the mark: a swatch for bars, a short line for lines. Text stays in text colours. */
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.kind === "rect" ? (
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          ) : (
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: i.color }} aria-hidden />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Chart container: header, optional legend, the chart, and a "View data" table so every value is
 * reachable without hovering (keyboard, screen readers, colour-blind users).
 */
export function ChartCard({
  title,
  description,
  legend,
  actions,
  table,
  children,
}: {
  title: string;
  description?: ReactNode;
  legend?: LegendItem[];
  actions?: ReactNode;
  table: { columns: string[]; rows: Array<Array<string | number>> };
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} actions={actions} />
      <div className="px-5 pb-2 pt-4">
        {legend && legend.length > 1 && (
          <div className="mb-3">
            <Legend items={legend} />
          </div>
        )}
        {children}
      </div>
      <details className="group border-t border-border">
        <summary className="cursor-pointer select-none list-none px-5 py-2.5 text-xs font-medium text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">View data</span>
          <span className="hidden group-open:inline">Hide data</span>
        </summary>
        <div className="max-h-72 overflow-auto border-t border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2 text-muted">
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c} className={`px-5 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {table.rows.map((r, ri) => (
                <tr key={ri} className="border-t border-border/70">
                  {r.map((v, i) => (
                    <td key={i} className={`px-5 py-1.5 ${i === 0 ? "text-left text-muted" : "text-right"}`}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
