"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formToObject, useAction } from "@/components/form-utils";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { SettingField } from "@/lib/plugins/manifest";
import { ownerReconnectPlugin, ownerSavePluginSettings, ownerSetPluginEnabled } from "./actions";

/** On/off switch with a permission consent step when turning on. */
export function PluginToggle({ companyId, pluginId, name, on, permissions }: { companyId: string; pluginId: string; name: string; on: boolean; permissions: string[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { execute, pending, error } = useAction(ownerSetPluginEnabled.bind(null, companyId, pluginId));
  const set = async (enabled: boolean) => {
    const r = await execute(enabled);
    if (r?.ok) {
      setConfirming(false);
      router.refresh();
    }
  };
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${name} ${on ? "on" : "off"}`}
        disabled={pending}
        onClick={() => (on ? set(false) : permissions.length ? setConfirming(true) : set(true))}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-primary" : "bg-border"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
      {confirming && (
        <div role="dialog" aria-label={`Turn on ${name}`} className="w-72 rounded-xl border border-border bg-surface p-3 text-left text-sm shadow-lg">
          <p className="font-medium">Allow {name} to:</p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {permissions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => set(true)}>
              Allow &amp; turn on
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

/** Settings form generated from the plugin's manifest. Secrets are write-only. */
export function PluginSettingsForm({
  companyId,
  pluginId,
  fields,
  values,
  secretsSet,
}: {
  companyId: string;
  pluginId: string;
  fields: SettingField[];
  values: Record<string, string | number | boolean>;
  secretsSet: Record<string, boolean>;
}) {
  const router = useRouter();
  const { execute, pending, error, message, fieldErrors } = useAction(ownerSavePluginSettings.bind(null, companyId, pluginId));
  const [clear, setClear] = useState<string[]>([]);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await execute(formToObject(e.currentTarget), clear);
        if (r?.ok) {
          setClear([]);
          router.refresh();
        }
      }}
    >
      {fields.map((f) => {
        const id = `${pluginId}-${f.key}`;
        const v = values[f.key];
        if (f.type === "boolean") {
          return (
            <label key={f.key} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={f.key} defaultChecked={!!v} className="mt-1" />
              <span>
                {f.label}
                {f.help && <span className="block text-xs text-muted">{f.help}</span>}
              </span>
            </label>
          );
        }
        return (
          <Field key={f.key} label={f.label} required={f.required} hint={f.help} error={fieldErrors[f.key]}>
            {f.type === "textarea" ? (
              <Textarea id={id} name={f.key} defaultValue={String(v ?? "")} rows={3} required={f.required} />
            ) : f.type === "select" ? (
              <Select id={id} name={f.key} defaultValue={String(v ?? "")} required={f.required}>
                {!f.required && <option value="">—</option>}
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : f.type === "secret" ? (
              <div className="flex items-center gap-2">
                <Input id={id} name={f.key} type="password" autoComplete="off" placeholder={secretsSet[f.key] && !clear.includes(f.key) ? "•••••••• (saved, leave blank to keep)" : ""} />
                {secretsSet[f.key] && !clear.includes(f.key) && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setClear([...clear, f.key])}>
                    Remove
                  </Button>
                )}
              </div>
            ) : (
              <Input id={id} name={f.key} type={f.type === "number" ? "number" : f.type === "url" ? "url" : "text"} step="any" defaultValue={String(v ?? "")} required={f.required} />
            )}
          </Field>
        );
      })}
      {error && <Alert>{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      <Button disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}

export function ReconnectButton({ companyId, pluginId }: { companyId: string; pluginId: string }) {
  const { execute, pending, error, message } = useAction(ownerReconnectPlugin.bind(null, companyId, pluginId));
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" size="sm" className="self-start" disabled={pending} onClick={() => execute()}>
        {pending ? "Reconnecting…" : "Reconnect"}
      </Button>
      {error && <Alert>{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
    </div>
  );
}
