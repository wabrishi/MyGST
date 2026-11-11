"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction } from "@/components/form-utils";
import { Alert, Button, Card, Field, Input, Select, Table, Td, Th, Textarea } from "@/components/ui";
import { formatINR, toPaise } from "@/lib/gst/calc";
import type { OpenItem } from "@/lib/payments";
import { createPayment, loadOpenItems } from "./actions";

type Party = { id: string; name: string; type: "CUSTOMER" | "SUPPLIER" | "BOTH" };
const MODES = [
  ["BANK", "Bank transfer / NEFT"],
  ["UPI", "UPI"],
  ["CASH", "Cash"],
  ["CHEQUE", "Cheque"],
  ["CARD", "Card"],
  ["OTHER", "Other"],
] as const;

export function PaymentForm({
  companyId,
  parties,
  today,
  initial,
  allowPaid,
}: {
  companyId: string;
  parties: Party[];
  today: string;
  initial: { direction: "RECEIVED" | "PAID"; partyId: string; targetId?: string; items?: OpenItem[] };
  allowPaid: boolean;
}) {
  const { execute, pending, error, fieldErrors: fe } = useAction(createPayment.bind(null, companyId));
  const [direction, setDirection] = useState(initial.direction);
  const [partyId, setPartyId] = useState(initial.partyId);
  const [items, setItems] = useState<OpenItem[]>(initial.items ?? []);
  const [alloc, setAlloc] = useState<Record<string, string>>(() => {
    const t = initial.items?.find((i) => i.id === initial.targetId);
    return t ? { [t.id]: (t.balance / 100).toFixed(2) } : {};
  });
  const [amount, setAmount] = useState(() => {
    const t = initial.items?.find((i) => i.id === initial.targetId);
    return t ? (t.balance / 100).toFixed(2) : "";
  });
  const [loadedFor, setLoadedFor] = useState(initial.items ? `${initial.direction}|${initial.partyId}` : "");

  const visibleParties = parties.filter((p) => p.type === "BOTH" || p.type === (direction === "RECEIVED" ? "CUSTOMER" : "SUPPLIER"));

  useEffect(() => {
    const key = `${direction}|${partyId}`;
    if (!partyId || key === loadedFor) return;
    let live = true;
    loadOpenItems(companyId, partyId, direction).then((rows) => {
      if (!live) return;
      setItems(rows);
      setAlloc({});
      setLoadedFor(key);
    });
    return () => {
      live = false;
    };
  }, [companyId, partyId, direction, loadedFor]);

  const allocated = useMemo(() => Object.values(alloc).reduce((s, v) => s + toPaise(Number(v) || 0), 0), [alloc]);
  const amountP = toPaise(Number(amount) || 0);
  const advance = amountP - allocated;

  /** Fill allocations oldest-first up to the payment amount. */
  function autoAllocate() {
    let left = amountP;
    const next: Record<string, string> = {};
    for (const i of items) {
      if (left <= 0) break;
      const take = Math.min(left, i.balance);
      next[i.id] = (take / 100).toFixed(2);
      left -= take;
    }
    setAlloc(next);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        execute({
          direction,
          partyId,
          date: String(f.get("date")),
          amount,
          mode: String(f.get("mode")) as (typeof MODES)[number][0],
          reference: String(f.get("reference")),
          notes: String(f.get("notes")),
          allocations: Object.entries(alloc)
            .filter(([, v]) => Number(v) > 0)
            .map(([targetId, v]) => ({ targetId, amount: v })),
        });
      }}
    >
      {error && <Alert>{error}</Alert>}
      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Type">
          <Select
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value as "RECEIVED" | "PAID");
              setPartyId("");
              setItems([]);
              setAlloc({});
            }}
          >
            <option value="RECEIVED">Payment received (from customer)</option>
            {allowPaid && <option value="PAID">Payment made (to supplier)</option>}
          </Select>
        </Field>
        <Field label="Party" required error={fe.partyId}>
          <Select value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
            <option value="">Select party…</option>
            {visibleParties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" required error={fe.date}>
          <Input type="date" name="date" defaultValue={today} required />
        </Field>
        <Field label="Amount (₹)" required error={fe.amount}>
          <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Mode">
          <Select name="mode" defaultValue="BANK">
            {MODES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference" hint="UTR / cheque no. / transaction id">
          <Input name="reference" maxLength={100} />
        </Field>
        <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
          <Textarea name="notes" rows={2} maxLength={1000} />
        </Field>
      </Card>

      <Card>
        <div className="flex items-center justify-between p-3">
          <h2 className="font-semibold">Allocate against {direction === "RECEIVED" ? "invoices" : "bills"}</h2>
          <Button type="button" variant="secondary" onClick={autoAllocate} disabled={!items.length || !amountP}>
            Auto-allocate (oldest first)
          </Button>
        </div>
        {!partyId ? (
          <p className="px-3 pb-4 text-muted">Select a party to see open {direction === "RECEIVED" ? "invoices" : "bills"}.</p>
        ) : items.length === 0 ? (
          <p className="px-3 pb-4 text-muted">No open documents. The full amount will be recorded as an advance.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Document</Th>
                <Th>Date</Th>
                <Th>Due</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Balance</Th>
                <Th className="w-40 text-right">Allocate (₹)</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <Td>
                    {i.number}
                    {i.kind === "DEBIT_NOTE" && <span className="ml-1 text-xs text-muted">(debit note)</span>}
                  </Td>
                  <Td>{i.date}</Td>
                  <Td>{i.dueDate}</Td>
                  <Td className="tabular text-right">{formatINR(i.total)}</Td>
                  <Td className="tabular text-right">{formatINR(i.balance)}</Td>
                  <Td>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={(i.balance / 100).toFixed(2)}
                      className="text-right"
                      value={alloc[i.id] ?? ""}
                      onChange={(e) => setAlloc((a) => ({ ...a, [i.id]: e.target.value }))}
                      aria-label={`Allocate to ${i.number}`}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="tabular flex flex-wrap justify-end gap-6 border-t border-border p-3">
          <span>
            Allocated: <b>{formatINR(allocated)}</b>
          </span>
          <span className={advance < 0 ? "text-danger" : ""}>
            {advance < 0 ? "Over-allocated" : "Advance / unallocated"}: <b>{formatINR(Math.abs(advance))}</b>
          </span>
        </div>
      </Card>

      <div>
        <Button disabled={pending || advance < 0}>{pending ? "Saving…" : "Save payment"}</Button>
      </div>
    </form>
  );
}
