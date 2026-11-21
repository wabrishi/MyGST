"use client";

import { useRouter } from "next/navigation";
import { formToObject, useAction } from "@/components/form-utils";
import { Alert, Button, Field, Input } from "@/components/ui";
import { updateProfile } from "./actions";

export function ProfileForm({ name, email, phone }: { name: string; email: string; phone: string }) {
  const router = useRouter();
  const { execute, pending, error, message, fieldErrors } = useAction(updateProfile);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await execute(formToObject(e.currentTarget)))?.ok) router.refresh();
      }}
    >
      <Field label="Your name" error={fieldErrors.name}>
        <Input name="name" defaultValue={name} required maxLength={100} autoComplete="name" />
      </Field>
      <Field label="Email" hint="Your sign-in email can't be changed here.">
        <Input value={email} disabled readOnly />
      </Field>
      <Field label="Mobile number" hint="10-digit mobile, e.g. 98765 43210" error={fieldErrors.phone}>
        <Input name="phone" type="tel" inputMode="tel" defaultValue={phone} required maxLength={20} autoComplete="tel" placeholder="+91" />
      </Field>
      {error && !Object.keys(fieldErrors).length && <Alert>{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      <div>
        <Button disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
      </div>
    </form>
  );
}
