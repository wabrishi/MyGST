"use client";

import { useAction } from "@/components/form-utils";
import { Alert, Button } from "@/components/ui";
import { uploadLogo } from "../actions";

export function LogoForm({ companyId, logo }: { companyId: string; logo: string | null }) {
  const { execute, pending, error, message } = useAction(uploadLogo.bind(null, companyId));
  return (
    <form
      className="flex flex-wrap items-center gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        execute(new FormData(e.currentTarget));
      }}
    >
      <div className="flex h-16 w-32 items-center justify-center rounded border border-dashed border-border bg-background">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="Company logo" className="max-h-14 max-w-28 object-contain" /> : <span className="text-xs text-muted">No logo</span>}
      </div>
      <div className="flex flex-col gap-2">
        <input type="file" name="logo" accept="image/png,image/jpeg" className="text-xs" />
        <span className="text-xs text-muted">PNG or JPEG, max 200 KB. Submit empty to remove.</span>
      </div>
      <Button variant="secondary" disabled={pending}>
        {pending ? "Uploading…" : "Save logo"}
      </Button>
      {error && <Alert>{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
    </form>
  );
}
