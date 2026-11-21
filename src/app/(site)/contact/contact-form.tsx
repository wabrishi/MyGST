"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import { formToObject, useAction } from "@/components/form-utils";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CONTACT_TOPICS } from "@/lib/site";
import { sendContactMessage } from "./actions";

export function ContactForm({ token, topic }: { token: string; topic: string }) {
  const { execute, pending, error, fieldErrors } = useAction(sendContactMessage);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-14 text-center shadow-card">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 size={24} />
        </span>
        <h2 className="text-xl font-semibold">Message sent</h2>
        <p className="max-w-sm text-sm text-muted">Thanks for writing to us. We&apos;ll reply by email as soon as we can.</p>
        <Button variant="secondary" onClick={() => setSent(false)}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card sm:grid-cols-2 sm:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await execute(formToObject(e.currentTarget));
        if (r?.ok) setSent(true);
      }}
    >
      <input type="hidden" name="token" value={token} />
      {/* Honeypot: hidden from people, filled by bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Field label="Your name" error={fieldErrors.name} required>
        <Input name="name" autoComplete="name" required maxLength={120} />
      </Field>
      <Field label="Email" error={fieldErrors.email} required>
        <Input name="email" type="email" autoComplete="email" required maxLength={160} />
      </Field>
      <Field label="Mobile number" hint="10-digit mobile, e.g. 98765 43210" error={fieldErrors.phone} required>
        <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} placeholder="+91" />
      </Field>
      <Field label="Business name" hint="Optional" error={fieldErrors.company}>
        <Input name="company" autoComplete="organization" maxLength={160} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="What's it about?">
          <Select name="topic" defaultValue={topic}>
            {CONTACT_TOPICS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Message" error={fieldErrors.message} required>
          <Textarea name="message" rows={6} required minLength={10} maxLength={5000} placeholder="Tell us about your business and how we can help." />
        </Field>
      </div>
      {error && !Object.keys(fieldErrors).length && (
        <div className="sm:col-span-2">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
        <p className="text-xs text-muted">We use your details only to reply to you.</p>
        <Button size="lg" disabled={pending}>
          <Send size={16} /> {pending ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
