"use client";

import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/components/form-utils";
import { LineItemsTable, TotalsCard, linesForSubmit, toLines, useLineCalc, type Line, type LineProduct, type LineValues } from "@/components/line-items";
import { StateSelect } from "@/components/state-select";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { sgstLabel, stateName } from "@/lib/gst/states";
import { saveBill } from "./actions";

export interface PurchaseFormInitial {
  partyId: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  itcType: "ELIGIBLE" | "INELIGIBLE" | "CAPITAL_GOODS";
  pricesIncludeTax: boolean;
  notes: string;
  items: LineValues[];
}

export function PurchaseForm({
  companyId,
  billId,
  suppliers,
  products,
  initial,
}: {
  companyId: string;
  billId: string | null;
  suppliers: Array<{ id: string; name: string; gstin: string; stateCode: string; creditDays: number }>;
  products: LineProduct[];
  initial: PurchaseFormInitial;
}) {
  const { execute, pending, error, fieldErrors: fe } = useAction(saveBill.bind(null, companyId, billId));
  const [partyId, setPartyId] = useState(initial.partyId);
  const [pos, setPos] = useState(initial.placeOfSupply);
  const [inclusive, setInclusive] = useState(initial.pricesIncludeTax);
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
          billNumber: String(f.get("billNumber")),
          billDate: String(f.get("billDate")),
          dueDate: String(f.get("dueDate")),
          placeOfSupply: pos,
          reverseCharge: f.get("reverseCharge") === "on",
          itcType: String(f.get("itcType")) as PurchaseFormInitial["itcType"],
          pricesIncludeTax: inclusive,
          notes: String(f.get("notes")),
          items: linesForSubmit(lines),
        });
      }}
    >
      {error && <Alert>{error}</Alert>}
      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Supplier" required error={fe.partyId} className="sm:col-span-2">
          <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
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
        <Field label="Supplier bill no." required error={fe.billNumber}>
          <Input name="billNumber" defaultValue={initial.billNumber} required maxLength={30} />
        </Field>
        <Field label="Bill date" required error={fe.billDate}>
          <Input type="date" name="billDate" defaultValue={initial.billDate} required />
        </Field>
        <Field label="Place of supply" required error={fe.placeOfSupply} hint={supplier ? (interstate ? "Inter-state → IGST" : "Intra-state → CGST + SGST") : undefined}>
          <StateSelect value={pos} onChange={(e) => setPos(e.target.value)} required />
        </Field>
        <Field label="Due date" error={fe.dueDate}>
          <Input type="date" name="dueDate" defaultValue={initial.dueDate} />
        </Field>
        <Field label="Input tax credit" error={fe.itcType}>
          <Select name="itcType" defaultValue={initial.itcType}>
            <option value="ELIGIBLE">Eligible ITC (inputs / services)</option>
            <option value="CAPITAL_GOODS">Eligible ITC (capital goods)</option>
            <option value="INELIGIBLE">Ineligible / blocked (Sec 17(5))</option>
          </Select>
        </Field>
        <div className="flex flex-col justify-end gap-1">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} />
            Rates include GST
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="reverseCharge" defaultChecked={initial.reverseCharge} />
            Reverse charge
          </label>
        </div>
        {supplier && (
          <p className="text-xs text-muted sm:col-span-2 lg:col-span-4">
            {supplier.gstin ? `Registered supplier · ${supplier.gstin}` : "Unregistered supplier — no ITC unless under reverse charge"} ·{" "}
            {stateName(supplier.stateCode)}
          </p>
        )}
      </Card>

      <LineItemsTable lines={lines} setLines={setLines} products={products} taxable={computed.map((c) => c.taxable)} fieldErrors={fe} />

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <Field label="Notes">
            <Textarea name="notes" defaultValue={initial.notes} rows={4} maxLength={2000} />
          </Field>
        </Card>
        <TotalsCard totals={totals} interstate={interstate} sgstLabel={sgstLabel(pos)}>
          <Button className="mt-4 w-full" disabled={pending}>
            {pending ? "Saving…" : billId ? "Save changes" : "Save bill"}
          </Button>
        </TotalsCard>
      </div>
    </form>
  );
}
