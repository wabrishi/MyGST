"use client";

import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/components/form-utils";
import { LineItemsTable, TotalsCard, linesForSubmit, toLines, useLineCalc, type Line, type LineProduct, type LineValues } from "@/components/line-items";
import { StateSelect } from "@/components/state-select";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { sgstLabel, stateName } from "@/lib/gst/states";
import { savePO } from "./actions";

export interface PoFormInitial {
  partyId: string;
  date: string;
  expectedDate: string;
  placeOfSupply: string;
  pricesIncludeTax: boolean;
  deliveryAddress: string;
  paymentTerms: string;
  notes: string;
  items: LineValues[];
  /** Created from a quotation received on MyGSTBook. */
  received?: { id: string; from: string; number: string } | null;
}

export function PurchaseOrderForm({
  companyId,
  poId,
  number,
  suppliers,
  products,
  initial,
  supplierLocked,
}: {
  companyId: string;
  poId: string | null;
  /** The (next) PO number, shown for information. */
  number: string;
  suppliers: Array<{ id: string; name: string; gstin: string; stateCode: string; creditDays: number }>;
  products: LineProduct[];
  initial: PoFormInitial;
  /** Billed orders can't change supplier. */
  supplierLocked?: boolean;
}) {
  const { execute, pending, error, fieldErrors: fe } = useAction(savePO.bind(null, companyId, poId));
  const [partyId, setPartyId] = useState(initial.partyId);
  const [pos, setPos] = useState(initial.placeOfSupply);
  const [inclusive, setInclusive] = useState(initial.pricesIncludeTax);
  const [terms, setTerms] = useState(initial.paymentTerms);
  const [lines, setLines] = useState<Line[]>(() => toLines(initial.items));
  const supplier = suppliers.find((s) => s.id === partyId);
  const interstate = !!supplier && supplier.stateCode !== pos;
  const { lines: computed, totals } = useLineCalc(lines, interstate, inclusive);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        execute({
          partyId,
          date: String(f.get("date")),
          expectedDate: String(f.get("expectedDate")),
          placeOfSupply: pos,
          pricesIncludeTax: inclusive,
          deliveryAddress: String(f.get("deliveryAddress")),
          paymentTerms: terms,
          notes: String(f.get("notes")),
          receivedId: initial.received?.id ?? "",
          items: linesForSubmit(lines),
        });
      }}
    >
      {error && <Alert>{error}</Alert>}
      {initial.received && (
        <Alert kind="info">
          Ordering from quotation <b>{initial.received.number}</b> by <b>{initial.received.from}</b>, received on MyGSTBook. Check the lines and dates, then save.
        </Alert>
      )}
      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Supplier" required error={fe.partyId} className="sm:col-span-2">
          <Select
            value={partyId}
            disabled={supplierLocked}
            required
            onChange={(e) => {
              setPartyId(e.target.value);
              const s = suppliers.find((x) => x.id === e.target.value);
              if (s && !terms) setTerms(s.creditDays > 0 ? `Net ${s.creditDays} days` : "");
            }}
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.gstin ? ` (${s.gstin})` : ""}
              </option>
            ))}
          </Select>
          <Link href={`/c/${companyId}/parties/new`} target="_blank" className="text-xs text-primary hover:underline">
            + Add supplier (then reload)
          </Link>
        </Field>
        <Field label="PO number" hint={poId ? undefined : "Assigned when you save"}>
          <Input value={number} readOnly className="bg-surface-2 font-mono" />
        </Field>
        <Field label="PO date" required error={fe.date}>
          <Input type="date" name="date" defaultValue={initial.date} required />
        </Field>
        <Field label="Expected delivery" error={fe.expectedDate}>
          <Input type="date" name="expectedDate" defaultValue={initial.expectedDate} />
        </Field>
        <Field label="Place of supply" required error={fe.placeOfSupply} hint={supplier ? (interstate ? "Inter-state → IGST" : "Intra-state → CGST + SGST") : "Usually your own state (goods come to you)"}>
          <StateSelect value={pos} onChange={(e) => setPos(e.target.value)} required />
        </Field>
        <Field label="Payment terms" error={fe.paymentTerms} className="sm:col-span-2">
          <Input value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={200} placeholder="e.g. Net 30 days, 50% advance" />
        </Field>
        <Field label="Deliver to" error={fe.deliveryAddress} className="sm:col-span-2 lg:col-span-3">
          <Textarea name="deliveryAddress" defaultValue={initial.deliveryAddress} rows={2} maxLength={1000} />
        </Field>
        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} />
            Rates include GST
          </label>
        </div>
        {supplier && (
          <p className="text-xs text-muted sm:col-span-2 lg:col-span-4">
            {supplier.gstin ? `Registered supplier · ${supplier.gstin}` : "Unregistered supplier"} · {stateName(supplier.stateCode)}
          </p>
        )}
      </Card>

      <LineItemsTable lines={lines} setLines={setLines} products={products} taxable={computed.map((c) => c.taxable)} fieldErrors={fe} />

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <Field label="Notes for the supplier">
            <Textarea name="notes" defaultValue={initial.notes} rows={4} maxLength={2000} />
          </Field>
        </Card>
        <TotalsCard totals={totals} interstate={interstate} sgstLabel={sgstLabel(pos)}>
          <Button className="mt-4 w-full" disabled={pending}>
            {pending ? "Saving…" : poId ? "Save changes" : "Save purchase order"}
          </Button>
        </TotalsCard>
      </div>
    </form>
  );
}
