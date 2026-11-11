"use client";

import { Trash2 } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { GST_RATES, UNITS, calcDocument, formatINR } from "@/lib/gst/calc";
import { Button, Card, Input, Select } from "./ui";

/** Shared line-item editor + totals used by sales documents and purchase bills. */

export interface LineProduct {
  id: string;
  name: string;
  hsnSac: string;
  unit: string;
  price: number;
  gstRate: number;
}

export interface Line {
  key: number;
  productId: string;
  description: string;
  hsnSac: string;
  unit: string;
  qty: string;
  rate: string;
  discountPct: string;
  gstRate: string;
}

export interface LineValues {
  productId: string | null;
  description: string;
  hsnSac: string;
  unit: string;
  qty: number;
  rate: number;
  discountPct: number;
  gstRate: number;
}

let nextKey = 1;
export const blankLine = (): Line => ({
  key: nextKey++,
  productId: "",
  description: "",
  hsnSac: "",
  unit: "NOS",
  qty: "1",
  rate: "",
  discountPct: "0",
  gstRate: "18",
});

export const toLines = (items: LineValues[]): Line[] =>
  items.length
    ? items.map((i) => ({
        ...i,
        key: nextKey++,
        productId: i.productId ?? "",
        qty: String(i.qty),
        rate: String(i.rate),
        discountPct: String(i.discountPct),
        gstRate: String(i.gstRate),
      }))
    : [blankLine()];

/** Non-empty lines in the shape the server schemas accept. */
export const linesForSubmit = (lines: Line[]) =>
  lines
    .filter((l) => l.description.trim() || Number(l.rate))
    .map((l) => ({
      productId: l.productId || null,
      description: l.description,
      hsnSac: l.hsnSac,
      unit: l.unit,
      qty: l.qty,
      rate: l.rate || "0",
      discountPct: l.discountPct || "0",
      gstRate: l.gstRate,
    }));

export function useLineCalc(lines: Line[], interstate: boolean, pricesIncludeTax: boolean) {
  return useMemo(
    () =>
      calcDocument(
        lines.map((l) => ({ qty: Number(l.qty), rate: Number(l.rate), discountPct: Number(l.discountPct), gstRate: Number(l.gstRate) })),
        { interstate, pricesIncludeTax },
      ),
    [lines, interstate, pricesIncludeTax],
  );
}

export function LineItemsTable({
  lines,
  setLines,
  products,
  taxable,
  fieldErrors,
}: {
  lines: Line[];
  setLines: (fn: (ls: Line[]) => Line[]) => void;
  products: LineProduct[];
  taxable: number[];
  fieldErrors: Record<string, string>;
}) {
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function onProduct(key: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return update(key, { productId: "" });
    update(key, { productId, description: p.name, hsnSac: p.hsnSac, unit: p.unit, rate: String(p.price), gstRate: String(p.gstRate) });
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm [&_td]:px-1.5 [&_td]:py-1.5 [&_th]:px-1.5 [&_th]:py-2">
        <thead className="bg-background text-left text-xs text-muted">
          <tr>
            <th className="w-8">#</th>
            <th className="w-48">Product</th>
            <th>Description</th>
            <th className="w-24">HSN/SAC</th>
            <th className="w-20">Qty</th>
            <th className="w-20">Unit</th>
            <th className="w-28">Rate</th>
            <th className="w-16">Disc %</th>
            <th className="w-20">GST %</th>
            <th className="w-28 text-right">Amount</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => {
            const err = (f: string) => fieldErrors[`items.${idx}.${f}`];
            return (
              <tr key={l.key} className="border-t border-border align-top">
                <td className="pt-3 text-muted">{idx + 1}</td>
                <td>
                  <Select value={l.productId} onChange={(e) => onProduct(l.key, e.target.value)} aria-label={`Line ${idx + 1} product`}>
                    <option value="">— custom —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  <Input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="Item description" />
                  {err("description") && <div className="text-xs text-danger">{err("description")}</div>}
                </td>
                <td>
                  <Input value={l.hsnSac} onChange={(e) => update(l.key, { hsnSac: e.target.value })} inputMode="numeric" maxLength={8} />
                  {err("hsnSac") && <div className="text-xs text-danger">{err("hsnSac")}</div>}
                </td>
                <td>
                  <Input type="number" step="any" min={0} value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} aria-label={`Line ${idx + 1} qty`} />
                  {err("qty") && <div className="text-xs text-danger">{err("qty")}</div>}
                </td>
                <td>
                  <Input value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} list="line-units" className="uppercase" />
                </td>
                <td>
                  <Input type="number" step="any" min={0} value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} aria-label={`Line ${idx + 1} rate`} />
                </td>
                <td>
                  <Input type="number" step="any" min={0} max={100} value={l.discountPct} onChange={(e) => update(l.key, { discountPct: e.target.value })} />
                </td>
                <td>
                  <Select value={l.gstRate} onChange={(e) => update(l.key, { gstRate: e.target.value })}>
                    {[...new Set([...GST_RATES.map(String), l.gstRate])].map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="tabular pt-3 text-right">{formatINR(taxable[idx] ?? 0)}</td>
                <td>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2"
                    aria-label="Remove line"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine()]))}
                  >
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <datalist id="line-units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <div className="border-t border-border p-2">
        <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, blankLine()])}>
          + Add line
        </Button>
      </div>
    </Card>
  );
}

export function TotalsCard({
  totals,
  interstate,
  sgstLabel,
  children,
}: {
  totals: { taxable: number; cgst: number; sgst: number; igst: number; roundOff: number; grandTotal: number };
  interstate: boolean;
  sgstLabel: string;
  children?: ReactNode;
}) {
  return (
    <Card className="tabular p-4">
      <dl className="grid grid-cols-2 gap-y-1.5">
        <dt className="text-muted">Taxable value</dt>
        <dd className="text-right">{formatINR(totals.taxable)}</dd>
        {interstate ? (
          <>
            <dt className="text-muted">IGST</dt>
            <dd className="text-right">{formatINR(totals.igst)}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted">CGST</dt>
            <dd className="text-right">{formatINR(totals.cgst)}</dd>
            <dt className="text-muted">{sgstLabel}</dt>
            <dd className="text-right">{formatINR(totals.sgst)}</dd>
          </>
        )}
        <dt className="text-muted">Round off</dt>
        <dd className="text-right">{formatINR(totals.roundOff)}</dd>
        <dt className="border-t border-border pt-2 text-base font-semibold">Total</dt>
        <dd className="border-t border-border pt-2 text-right text-base font-semibold">{formatINR(totals.grandTotal)}</dd>
      </dl>
      {children}
    </Card>
  );
}
