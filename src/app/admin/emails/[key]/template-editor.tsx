"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useAction } from "@/components/form-utils";
import { Alert, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { renderTemplate, usedVars } from "@/lib/email-templates";
import { adminResetTemplate, adminSaveTemplate, adminSendTestTemplate } from "../actions";

type Var = { name: string; help: string; sample: string };

/** Subject + HTML body editor with variables, a live preview, a test send and reset. */
export function TemplateEditor({
  templateKey,
  initial,
  defaults,
  vars,
  edited,
}: {
  templateKey: string;
  initial: { subject: string; body: string };
  defaults: { subject: string; body: string };
  vars: Var[];
  edited: boolean;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [confirmReset, setConfirmReset] = useState(false);
  // Only the latest action's result is shown.
  const [last, setLast] = useState<"save" | "test" | "reset" | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const save = useAction(adminSaveTemplate.bind(null, templateKey));
  const test = useAction(adminSendTestTemplate.bind(null, templateKey));
  const reset = useAction(adminResetTemplate.bind(null, templateKey));

  const samples = useMemo(() => Object.fromEntries(vars.map((v) => [v.name, v.sample])), [vars]);
  const preview = useMemo(() => renderTemplate({ subject, body }, samples), [subject, body, samples]);
  const known = new Set(vars.map((v) => v.name));
  const unknown = usedVars(`${subject} ${body}`).filter((v) => !known.has(v));
  const dirty = subject !== initial.subject || body !== initial.body;

  const insert = (name: string) => {
    const el = bodyRef.current;
    const token = `{{${name}}}`;
    if (!el) return setBody((b) => b + token);
    const { selectionStart: a, selectionEnd: z } = el;
    const next = body.slice(0, a) + token + body.slice(z);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4 p-5">
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
          </Field>
          <Field label="Body (HTML)" hint={'Use <p>, <b>, <a class="btn" href="…"> for a button, <p class="muted"> for small grey text.'}>
            <Textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="font-mono text-[12.5px]" spellCheck={false} />
          </Field>
          {unknown.length > 0 && <Alert kind="warning">Unknown variable{unknown.length > 1 ? "s" : ""}: {unknown.map((v) => `{{${v}}}`).join(", ")}</Alert>}
          {last && { save, test, reset }[last].error && <Alert>{{ save, test, reset }[last].error}</Alert>}
          {last && { save, test, reset }[last].message && <Alert kind="success">{{ save, test, reset }[last].message}</Alert>}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!dirty || save.pending || unknown.length > 0}
              onClick={async () => {
                setLast("save");
                if ((await save.execute({ subject, body }))?.ok) router.refresh();
              }}
            >
              {save.pending ? "Saving…" : "Save"}
            </Button>
            <Button variant="secondary" disabled={test.pending || unknown.length > 0} onClick={() => {
                setLast("test");
                test.execute({ subject, body });
              }}
            >
              {test.pending ? "Sending…" : "Send test to me"}
            </Button>
            {dirty && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSubject(initial.subject);
                  setBody(initial.body);
                }}
              >
                Discard changes
              </Button>
            )}
            <span className="ml-auto" />
            {confirmReset ? (
              <span className="inline-flex items-center gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={reset.pending}
                  onClick={async () => {
                    setLast("reset");
                    if ((await reset.execute())?.ok) {
                      setSubject(defaults.subject);
                      setBody(defaults.body);
                      setConfirmReset(false);
                      router.refresh();
                    }
                  }}
                >
                  Reset to default
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" disabled={!edited} onClick={() => setConfirmReset(true)}>
                Reset to default…
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Variables</h2>
          <p className="mb-3 text-xs text-muted">
            Click to insert at the cursor. {"{{#if name}}…{{/if}}"} shows a part only when the value isn&apos;t empty.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {vars.map((v) => (
              <li key={v.name}>
                <button type="button" onClick={() => insert(v.name)} className="w-full rounded-lg border border-border px-3 py-2 text-left hover:border-primary/40 hover:bg-primary-soft">
                  <span className="font-mono text-xs text-primary">{`{{${v.name}}}`}</span>
                  <span className="block text-xs text-muted">{v.help}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="flex flex-col overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <div className="text-xs text-muted">Preview with sample values</div>
          <div className="mt-0.5 font-semibold">{preview.subject}</div>
        </div>
        <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[640px] w-full flex-1 bg-white" />
      </Card>
    </div>
  );
}
