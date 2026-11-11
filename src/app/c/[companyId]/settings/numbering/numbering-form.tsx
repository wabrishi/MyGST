"use client";

import { formToObject, useAction } from "@/components/form-utils";
import { Alert, Button, Input, Table, Td, Th } from "@/components/ui";
import { updatePrefixes } from "../actions";

export function NumberingForm({
  companyId,
  fy,
  rows,
}: {
  companyId: string;
  fy: string;
  rows: Array<{ type: string; label: string; prefix: string; nextSeq: number }>;
}) {
  const { execute, pending, error, message, fieldErrors } = useAction(updatePrefixes.bind(null, companyId));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        execute(formToObject(e.currentTarget) as Record<string, string>);
      }}
    >
      {error && <Alert>{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      <Table>
        <thead>
          <tr>
            <Th>Document</Th>
            <Th>Prefix</Th>
            <Th>Next number</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.type}>
              <Td>{r.label}</Td>
              <Td>
                <Input name={r.type} defaultValue={r.prefix} maxLength={6} className="w-28 uppercase" />
                {fieldErrors[r.type] && <div className="text-xs text-danger">{fieldErrors[r.type]}</div>}
              </Td>
              <Td className="font-mono text-xs">
                {r.prefix}
                {fy}/{String(r.nextSeq).padStart(4, "0")}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div>
        <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
