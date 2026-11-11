"use client";

import { useState } from "react";
import { isValidGstin, normalizeGstin } from "@/lib/gst/gstin";
import type { CompanyInput } from "@/lib/validation";
import { formToObject, useAction } from "./form-utils";
import { StateSelect } from "./state-select";
import { Alert, Button, Field, Input, Textarea } from "./ui";

type Result = { ok: true; data: unknown; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type CompanySection = "business" | "bank" | "defaults";

/**
 * Company details form. `sections` renders a subset (used by the setup wizard); the server merges a
 * partial submission with the saved record before validating, so untouched fields are kept.
 */
export function CompanyForm({
  initial,
  action,
  submitLabel,
  disabled,
  sections = ["business", "bank", "defaults"],
  onSaved,
}: {
  initial?: Partial<CompanyInput>;
  action: (input: CompanyInput) => Promise<Result>;
  submitLabel: string;
  disabled?: boolean;
  sections?: CompanySection[];
  onSaved?: () => void;
}) {
  const show = (s: CompanySection) => sections.includes(s);
  const { execute, pending, error, message, fieldErrors: fe } = useAction(action);
  const [stateCode, setStateCode] = useState(initial?.stateCode ?? "");

  function onGstin(e: React.ChangeEvent<HTMLInputElement>) {
    const g = normalizeGstin(e.target.value);
    if (isValidGstin(g)) setStateCode(g.slice(0, 2));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(formToObject(e.currentTarget) as unknown as CompanyInput).then((r) => r?.ok && onSaved?.());
      }}
      className="flex flex-col gap-6"
    >
      {error && <Alert>{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      <fieldset disabled={disabled} className="contents">
        {show("business") && (
        <section className="grid gap-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Business details</h2>
          <Field label="Legal name" required error={fe.legalName}>
            <Input name="legalName" defaultValue={initial?.legalName} required maxLength={150} />
          </Field>
          <Field label="Trade name" error={fe.tradeName} hint="Shown on invoices if different">
            <Input name="tradeName" defaultValue={initial?.tradeName} maxLength={150} />
          </Field>
          <Field label="GSTIN" error={fe.gstin} hint="Leave blank if unregistered">
            <Input
              name="gstin"
              defaultValue={initial?.gstin}
              onChange={onGstin}
              maxLength={15}
              className="uppercase"
              placeholder="27ABCDE1234F1Z5"
            />
          </Field>
          <Field label="State" required error={fe.stateCode}>
            <StateSelect name="stateCode" value={stateCode} onChange={(e) => setStateCode(e.target.value)} required />
          </Field>
          <Field label="Address" error={fe.address} className="sm:col-span-2">
            <Textarea name="address" defaultValue={initial?.address} rows={2} maxLength={500} />
          </Field>
          <Field label="City" error={fe.city}>
            <Input name="city" defaultValue={initial?.city} />
          </Field>
          <Field label="PIN code" error={fe.pincode}>
            <Input name="pincode" defaultValue={initial?.pincode} inputMode="numeric" maxLength={6} />
          </Field>
          <Field label="Phone" error={fe.phone}>
            <Input name="phone" defaultValue={initial?.phone} />
          </Field>
          <Field label="Email" error={fe.email}>
            <Input name="email" type="email" defaultValue={initial?.email} />
          </Field>
        </section>
        )}

        {show("bank") && (
        <section className="grid gap-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Bank & payment details (printed on invoices)</h2>
          <Field label="Bank name" error={fe.bankName}>
            <Input name="bankName" defaultValue={initial?.bankName} />
          </Field>
          <Field label="Branch" error={fe.bankBranch}>
            <Input name="bankBranch" defaultValue={initial?.bankBranch} />
          </Field>
          <Field label="Account number" error={fe.bankAccount}>
            <Input name="bankAccount" defaultValue={initial?.bankAccount} inputMode="numeric" />
          </Field>
          <Field label="IFSC" error={fe.bankIfsc}>
            <Input name="bankIfsc" defaultValue={initial?.bankIfsc} className="uppercase" maxLength={11} />
          </Field>
          <Field label="UPI ID" error={fe.upiId}>
            <Input name="upiId" defaultValue={initial?.upiId} placeholder="business@bank" />
          </Field>
        </section>
        )}

        {show("defaults") && (
        <section className="grid gap-4">
          <h2 className="font-semibold">Invoice defaults</h2>
          <Field label="Terms & conditions" error={fe.terms}>
            <Textarea name="terms" defaultValue={initial?.terms} rows={3} maxLength={2000} />
          </Field>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="pricesIncludeTax" defaultChecked={!!initial?.pricesIncludeTax} />
            Item prices include GST by default
          </label>
        </section>
        )}

        <div>
          <Button disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        </div>
      </fieldset>
    </form>
  );
}
