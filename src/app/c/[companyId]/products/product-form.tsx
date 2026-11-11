"use client";

import { formToObject, useAction } from "@/components/form-utils";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { GST_RATES, UNITS } from "@/lib/gst/calc";
import type { ProductInput } from "@/lib/validation";
import { deleteProduct, saveProduct } from "./actions";

export function ProductForm({
  companyId,
  id,
  initial,
  canDelete,
}: {
  companyId: string;
  id: string | null;
  initial?: Partial<ProductInput>;
  canDelete?: boolean;
}) {
  const { execute, pending, error, fieldErrors: fe } = useAction(saveProduct.bind(null, companyId, id));
  const del = useAction(deleteProduct.bind(null, companyId, id ?? ""));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(formToObject(e.currentTarget) as unknown as ProductInput);
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      {(error || del.error) && (
        <div className="sm:col-span-2">
          <Alert>{error || del.error}</Alert>
        </div>
      )}
      <Field label="Name" required error={fe.name} className="sm:col-span-2">
        <Input name="name" defaultValue={initial?.name} required autoFocus maxLength={200} />
      </Field>
      <Field label="HSN / SAC code" error={fe.hsnSac} hint="4–8 digits. Mandatory on invoices for turnover above ₹5 Cr (6 digits) / ₹1.5 Cr (4 digits).">
        <Input name="hsnSac" defaultValue={initial?.hsnSac} inputMode="numeric" maxLength={8} />
      </Field>
      <Field label="Unit (UQC)" error={fe.unit}>
        <Input name="unit" defaultValue={initial?.unit ?? "NOS"} list="units" maxLength={10} className="uppercase" />
        <datalist id="units">
          {UNITS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </Field>
      <Field label="Sale price (₹)" error={fe.salePrice}>
        <Input name="salePrice" type="number" step="0.01" min={0} defaultValue={String(initial?.salePrice ?? 0)} />
      </Field>
      <Field label="Purchase price (₹)" error={fe.purchasePrice}>
        <Input name="purchasePrice" type="number" step="0.01" min={0} defaultValue={String(initial?.purchasePrice ?? 0)} />
      </Field>
      <Field label="GST rate (%)" error={fe.gstRate}>
        <Select name="gstRate" defaultValue={String(initial?.gstRate ?? 18)}>
          {GST_RATES.map((r) => (
            <option key={r} value={r}>
              {r}%
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 self-end pb-2">
        <input type="checkbox" name="isService" defaultChecked={!!initial?.isService} />
        This is a service (SAC)
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        {id && canDelete && (
          <Button type="button" variant="ghost" className="text-danger" disabled={del.pending} onClick={() => confirm("Remove this product?") && del.execute()}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
