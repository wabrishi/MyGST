"use client";

import { useState } from "react";
import { formToObject, useAction } from "@/components/form-utils";
import { StateSelect } from "@/components/state-select";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { isValidGstin, normalizeGstin } from "@/lib/gst/gstin";
import type { PartyInput } from "@/lib/validation";
import { deleteParty, saveParty } from "./actions";

export function PartyForm({
  companyId,
  id,
  initial,
  canDelete,
}: {
  companyId: string;
  id: string | null;
  initial?: Partial<PartyInput>;
  canDelete?: boolean;
}) {
  const { execute, pending, error, fieldErrors: fe } = useAction(saveParty.bind(null, companyId, id));
  const del = useAction(deleteParty.bind(null, companyId, id ?? ""));
  const [stateCode, setStateCode] = useState(initial?.stateCode ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(formToObject(e.currentTarget) as unknown as PartyInput);
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      {(error || del.error) && (
        <div className="sm:col-span-2">
          <Alert>{error || del.error}</Alert>
        </div>
      )}
      <Field label="Name" required error={fe.name}>
        <Input name="name" defaultValue={initial?.name} required autoFocus maxLength={150} />
      </Field>
      <Field label="Type" error={fe.type}>
        <Select name="type" defaultValue={initial?.type ?? "CUSTOMER"}>
          <option value="CUSTOMER">Customer</option>
          <option value="SUPPLIER">Supplier</option>
          <option value="BOTH">Customer & Supplier</option>
        </Select>
      </Field>
      <Field label="GSTIN" error={fe.gstin} hint="Leave blank for unregistered / consumers (B2C)">
        <Input
          name="gstin"
          defaultValue={initial?.gstin}
          maxLength={15}
          className="uppercase"
          onChange={(e) => {
            const g = normalizeGstin(e.target.value);
            if (isValidGstin(g)) setStateCode(g.slice(0, 2));
          }}
        />
      </Field>
      <Field label="State" required error={fe.stateCode} hint="Decides CGST+SGST vs IGST">
        <StateSelect name="stateCode" value={stateCode} onChange={(e) => setStateCode(e.target.value)} required />
      </Field>
      <Field label="Phone" error={fe.phone}>
        <Input name="phone" defaultValue={initial?.phone} />
      </Field>
      <Field label="Email" error={fe.email}>
        <Input name="email" type="email" defaultValue={initial?.email} />
      </Field>
      <Field label="Billing address" error={fe.billingAddress}>
        <Textarea name="billingAddress" defaultValue={initial?.billingAddress} rows={3} maxLength={500} />
      </Field>
      <Field label="Shipping address" error={fe.shippingAddress} hint="If different from billing">
        <Textarea name="shippingAddress" defaultValue={initial?.shippingAddress} rows={3} maxLength={500} />
      </Field>
      <Field label="Shipping state" error={fe.shippingState} hint="Place of supply for goods, if shipped to another state">
        <StateSelect name="shippingState" defaultValue={initial?.shippingState ?? ""} placeholder="Same as billing" />
      </Field>
      <Field label="Credit period (days)" error={fe.creditDays}>
        <Input name="creditDays" type="number" min={0} max={365} defaultValue={String(initial?.creditDays ?? 0)} />
      </Field>
      <Field label="Opening balance (₹)" error={fe.openingBalance} hint="Positive = receivable from them, negative = payable to them">
        <Input name="openingBalance" type="number" step="0.01" defaultValue={String(initial?.openingBalance ?? 0)} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        {id && canDelete && (
          <Button
            type="button"
            variant="ghost"
            className="text-danger"
            disabled={del.pending}
            onClick={() => confirm("Delete this party? Parties with transactions are deactivated instead.") && del.execute()}
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
