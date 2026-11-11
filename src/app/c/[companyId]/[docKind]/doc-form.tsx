"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAction } from "@/components/form-utils";
import { LineItemsTable, TotalsCard, linesForSubmit, toLines, useLineCalc, type Line, type LineProduct, type LineValues } from "@/components/line-items";
import { StateSelect } from "@/components/state-select";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { NOTE_REASONS, type DocKind } from "@/lib/doc-kinds";
import { formatINR } from "@/lib/gst/calc";
import { sgstLabel, stateName } from "@/lib/gst/states";
import { invoicesForParty, saveDoc } from "./actions";

export interface FormParty {
  id: string;
  name: string;
  gstin: string;
  stateCode: string;
  shippingState: string | null;
  shippingAddress: string;
  creditDays: number;
}
export type FormProduct = LineProduct;
export interface DocFormInitial {
  partyId: string;
  date: string;
  dueDate: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  pricesIncludeTax: boolean;
  shippingAddress: string;
  notes: string;
  originalDocId: string;
  noteReason: string;
  sourceQuotationId: string;
  items: LineValues[];
}

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function DocForm({
  companyId,
  kind,
  docId,
  numberPreview,
  companyState,
  parties,
  products,
  initial,
}: {
  companyId: string;
  kind: DocKind;
  docId: string | null;
  numberPreview: string;
  companyState: string;
  parties: FormParty[];
  products: FormProduct[];
  initial: DocFormInitial;
}) {
  const isNote = kind === "credit-notes" || kind === "debit-notes";
  const { execute, pending, error, fieldErrors: fe } = useAction(saveDoc.bind(null, companyId, kind, docId));

  const [partyId, setPartyId] = useState(initial.partyId);
  const [date, setDate] = useState(initial.date);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [pos, setPos] = useState(initial.placeOfSupply);
  const [reverseCharge, setReverseCharge] = useState(initial.reverseCharge);
  const [inclusive, setInclusive] = useState(initial.pricesIncludeTax);
  const [shippingAddress, setShippingAddress] = useState(initial.shippingAddress);
  const [notes, setNotes] = useState(initial.notes);
  const [originalDocId, setOriginalDocId] = useState(initial.originalDocId);
  const [noteReason, setNoteReason] = useState(initial.noteReason);
  const [invoices, setInvoices] = useState<Array<{ id: string; number: string; date: string; total: number; placeOfSupply: string }>>([]);
  const [lines, setLines] = useState<Line[]>(() => toLines(initial.items));

  const party = parties.find((p) => p.id === partyId);

  // Load the party's invoices for credit/debit notes.
  useEffect(() => {
    if (!isNote || !partyId) return;
    let live = true;
    invoicesForParty(companyId, partyId).then((rows) => live && setInvoices(rows));
    return () => {
      live = false;
    };
  }, [isNote, partyId, companyId]);

  function onParty(id: string) {
    setPartyId(id);
    const p = parties.find((x) => x.id === id);
    if (!p) return;
    if (!isNote) setPos(p.shippingState || p.stateCode);
    if (kind === "invoices" && p.creditDays > 0) setDueDate(addDays(date, p.creditDays));
    if (isNote) setOriginalDocId("");
  }

  const interstate = (pos || companyState) !== companyState;
  const { lines: computed, totals } = useLineCalc(lines, interstate, inclusive);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    execute({
      partyId,
      date,
      dueDate,
      placeOfSupply: pos,
      reverseCharge,
      pricesIncludeTax: inclusive,
      shippingAddress,
      notes,
      originalDocId,
      noteReason,
      sourceQuotationId: initial.sourceQuotationId,
      items: linesForSubmit(lines),
    });
  }

  const sLabel = sgstLabel(companyState);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}

      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={kind === "quotations" ? "Customer" : "Party"} required error={fe.partyId} className="sm:col-span-2">
          <Select value={partyId} onChange={(e) => onParty(e.target.value)} required>
            <option value="">Select party…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.gstin ? ` (${p.gstin})` : ""}
              </option>
            ))}
          </Select>
          <Link href={`/c/${companyId}/parties/new`} target="_blank" className="text-xs text-primary hover:underline">
            + Add new party (then reload)
          </Link>
        </Field>
        <Field label="Number">
          <Input value={numberPreview} disabled readOnly />
        </Field>
        <Field label="Date" required error={fe.date}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>

        {isNote ? (
          <>
            <Field label="Against invoice" required error={fe.originalDocId} className="sm:col-span-2">
              <Select
                value={originalDocId}
                onChange={(e) => {
                  setOriginalDocId(e.target.value);
                  const inv = invoices.find((i) => i.id === e.target.value);
                  if (inv) setPos(inv.placeOfSupply);
                }}
                required
                disabled={!partyId}
              >
                <option value="">{partyId ? "Select invoice…" : "Select a party first"}</option>
                {invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.number} · {i.date} · {formatINR(i.total)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason" required error={fe.noteReason} className="sm:col-span-2">
              <Select value={noteReason} onChange={(e) => setNoteReason(e.target.value)} required>
                <option value="">Select reason…</option>
                {NOTE_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Place of supply" required error={fe.placeOfSupply} hint={interstate ? "Inter-state → IGST" : `Intra-state → CGST + ${sLabel}`}>
              <StateSelect value={pos} onChange={(e) => setPos(e.target.value)} required />
            </Field>
            <Field label={kind === "quotations" ? "Valid until" : "Due date"} error={fe.dueDate}>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={date} />
            </Field>
            <Field label="Shipping address" className="sm:col-span-2" hint={party ? `Default: party's shipping address` : undefined}>
              <Input value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} placeholder={party?.shippingAddress || "Same as billing"} />
            </Field>
          </>
        )}
        <div className="flex flex-col justify-end gap-1 sm:col-span-2 lg:col-span-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} />
            Rates include GST
          </label>
          {kind === "invoices" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={reverseCharge} onChange={(e) => setReverseCharge(e.target.checked)} />
              Tax payable on reverse charge
            </label>
          )}
          {party && (
            <span className="text-xs text-muted">
              {party.gstin ? `Registered (B2B) · ${party.gstin}` : "Unregistered (B2C)"} · {stateName(party.stateCode)}
            </span>
          )}
        </div>
      </Card>

      <LineItemsTable lines={lines} setLines={setLines} products={products} taxable={computed.map((c) => c.taxable)} fieldErrors={fe} />

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <Field label="Notes (printed on document)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={2000} />
          </Field>
        </Card>
        <TotalsCard totals={totals} interstate={interstate} sgstLabel={sLabel}>
          <Button className="mt-4 w-full" disabled={pending}>
            {pending ? "Saving…" : docId ? "Save changes" : "Save"}
          </Button>
        </TotalsCard>
      </div>
    </form>
  );
}
