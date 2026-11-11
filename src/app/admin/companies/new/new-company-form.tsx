"use client";

import Link from "next/link";
import { useState } from "react";
import { formToObject, useAction } from "@/components/form-utils";
import { StateSelect } from "@/components/state-select";
import { Alert, Button, ButtonLink, Field, Input } from "@/components/ui";
import { isValidGstin, normalizeGstin } from "@/lib/gst/gstin";
import { adminCreateCompany, type CreatedCompany, type NewCompanyInput } from "../../actions";

export function NewCompanyForm() {
  const { execute, pending, error, fieldErrors: fe } = useAction(adminCreateCompany);
  const [stateCode, setStateCode] = useState("");
  const [created, setCreated] = useState<CreatedCompany | null>(null);

  if (created) {
    return (
      <div className="flex flex-col gap-4">
        <Alert kind="success">
          Company created.{" "}
          {created.owner === "member"
            ? "The owner already had an account and has been added — they'll see the company and the setup wizard when they sign in."
            : created.emailed
              ? "An owner invitation has been emailed."
              : "Email isn't configured — send the owner this invitation link:"}
        </Alert>
        {created.link && !created.emailed && <code className="break-all rounded bg-background p-2 text-xs">{created.link}</code>}
        <div className="flex gap-2">
          <ButtonLink href={`/admin/companies/${created.companyId}`}>View company</ButtonLink>
          <Button variant="secondary" onClick={() => setCreated(null)}>
            Create another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await execute(formToObject(e.currentTarget) as unknown as NewCompanyInput);
        if (r?.ok) setCreated(r.data);
      }}
    >
      {error && (
        <div className="sm:col-span-2">
          <Alert>{error}</Alert>
        </div>
      )}
      <Field label="Legal name" required error={fe.legalName}>
        <Input name="legalName" required maxLength={150} autoFocus />
      </Field>
      <Field label="Trade name" error={fe.tradeName}>
        <Input name="tradeName" maxLength={150} />
      </Field>
      <Field label="GSTIN" error={fe.gstin} hint="Optional — the owner can add it during setup">
        <Input
          name="gstin"
          maxLength={15}
          className="uppercase"
          onChange={(e) => {
            const g = normalizeGstin(e.target.value);
            if (isValidGstin(g)) setStateCode(g.slice(0, 2));
          }}
        />
      </Field>
      <Field label="State" required error={fe.stateCode}>
        <StateSelect name="stateCode" value={stateCode} onChange={(e) => setStateCode(e.target.value)} required />
      </Field>
      <Field label="Owner email" required error={fe.ownerEmail} className="sm:col-span-2" hint="Existing users are added as owner immediately; others receive an invitation.">
        <Input name="ownerEmail" type="email" required />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button disabled={pending}>{pending ? "Creating…" : "Create company"}</Button>
        <Link href="/admin" className="self-center text-sm text-muted hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
