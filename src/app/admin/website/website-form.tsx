"use client";

import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formToObject, useAction } from "@/components/form-utils";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { formatMobile, normalizeMobile } from "@/lib/phone";
import type { SiteContact } from "@/lib/site-store";
import { adminSaveSiteContact } from "./actions";

/** Edits the public website's contact details, with a live preview. */
export function WebsiteForm({ initial }: { initial: SiteContact }) {
  const router = useRouter();
  const { execute, pending, error, message, fieldErrors } = useAction(adminSaveSiteContact);
  const [v, setV] = useState({ ...initial, sameWhatsapp: !!initial.mobile && initial.whatsapp === initial.mobile });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const mobile = normalizeMobile(v.mobile);
  const whatsapp = v.sameWhatsapp ? mobile : normalizeMobile(v.whatsapp);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <form
        className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-card"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await execute(formToObject(e.currentTarget));
          if (r?.ok) router.refresh();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile number" hint="Shown on the website with a tap-to-call link" error={fieldErrors.mobile}>
            <Input name="mobile" type="tel" inputMode="tel" value={v.mobile} onChange={set("mobile")} placeholder="+91 98765 43210" maxLength={20} />
          </Field>
          <Field label="WhatsApp number" error={fieldErrors.whatsapp}>
            <Input name="whatsapp" type="tel" inputMode="tel" value={v.sameWhatsapp ? v.mobile : v.whatsapp} onChange={set("whatsapp")} disabled={v.sameWhatsapp} maxLength={20} />
          </Field>
        </div>
        <label className="-mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" name="sameWhatsapp" checked={v.sameWhatsapp} onChange={(e) => setV((s) => ({ ...s, sameWhatsapp: e.target.checked }))} />
          WhatsApp is on the same number
        </label>
        <Field label="Public email" hint="Shown on the website" error={fieldErrors.email}>
          <Input name="email" type="email" value={v.email} onChange={set("email")} placeholder="hello@yourdomain.com" maxLength={160} />
        </Field>
        <Field label="Office address" hint="Optional; line breaks are kept" error={fieldErrors.address}>
          <Textarea name="address" rows={3} value={v.address} onChange={set("address")} maxLength={500} />
        </Field>
        <Field label="Send contact messages to" hint="Where messages from the Contact page are emailed. Leave empty to use the public email." error={fieldErrors.notifyEmail}>
          <Input name="notifyEmail" type="email" value={v.notifyEmail} onChange={set("notifyEmail")} maxLength={160} />
        </Field>
        {error && !Object.keys(fieldErrors).length && <Alert>{error}</Alert>}
        {message && <Alert kind="success">{message}</Alert>}
        <div>
          <Button disabled={pending}>{pending ? "Saving…" : "Save contact details"}</Button>
        </div>
      </form>

      <aside className="rounded-xl border border-border bg-surface p-5 shadow-card lg:self-start">
        <h2 className="text-sm font-semibold">Preview</h2>
        <p className="mt-1 text-xs text-muted">How visitors see it on the Contact page and in the footer.</p>
        <ul className="mt-4 space-y-3 text-sm">
          <li className="flex items-center gap-2.5">
            <Phone size={15} className="text-primary" /> {mobile ? formatMobile(mobile) : <span className="text-muted">No mobile</span>}
          </li>
          <li className="flex items-center gap-2.5">
            <MessageCircle size={15} className="text-primary" /> {whatsapp ? `WhatsApp ${formatMobile(whatsapp)}` : <span className="text-muted">No WhatsApp</span>}
          </li>
          <li className="flex items-center gap-2.5 break-all">
            <Mail size={15} className="shrink-0 text-primary" /> {v.email || <span className="text-muted">No email</span>}
          </li>
          <li className="flex items-start gap-2.5">
            <MapPin size={15} className="mt-0.5 shrink-0 text-primary" />
            {v.address ? <span className="whitespace-pre-line">{v.address}</span> : <span className="text-muted">No address</span>}
          </li>
        </ul>
        {v.mobile && !mobile && <p className="mt-3 text-xs text-danger">That mobile number doesn&apos;t look right.</p>}
      </aside>
    </div>
  );
}
