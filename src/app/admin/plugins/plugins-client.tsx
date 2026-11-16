"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/form-utils";
import { Alert, Button, Field, Input } from "@/components/ui";
import { adminAddExternalPlugin, adminInstallPlugin, adminRescanPlugins, adminSetAvailability, adminSetCompanyAccess, adminUninstallPlugin } from "./actions";

const AVAILABILITY = [
  { value: "ALL", label: "All companies", hint: "Every company can use it (you can still block some)." },
  { value: "SELECTED", label: "Selected companies", hint: "Only companies you allow on the plugin page." },
  { value: "NONE", label: "Nobody yet", hint: "Installed but switched off everywhere." },
] as const;

/** Install dialog: permissions consent + "enable by default?" + availability. */
export function InstallPanel({ pluginId, name, permissions }: { pluginId: string; name: string; permissions: Array<{ key: string; label: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availability, setAvail] = useState<string>("ALL");
  const [defaultEnabled, setDefault] = useState(true);
  const { execute, pending, error } = useAction(adminInstallPlugin.bind(null, pluginId));
  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Install
      </Button>
    );
  }
  return (
    <div role="dialog" aria-label={`Install ${name}`} className="mt-3 flex w-full flex-col gap-4 rounded-xl border border-border bg-surface-2 p-4 text-left">
      <div>
        <div className="font-semibold">Install {name}</div>
        {permissions.length ? (
          <>
            <p className="mt-1 text-sm text-muted">This plugin will be able to:</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {permissions.map((p) => (
                <li key={p.key}>{p.label}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">This plugin doesn&apos;t read or change company data.</p>
        )}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Enable by default for every company?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name={`default-${pluginId}`} checked={defaultEnabled} onChange={() => setDefault(true)} /> Yes, on by default (owners can turn it off)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name={`default-${pluginId}`} checked={!defaultEnabled} onChange={() => setDefault(false)} /> No, owners turn it on themselves
        </label>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Available to</legend>
        {AVAILABILITY.map((a) => (
          <label key={a.value} className="flex items-start gap-2 text-sm">
            <input type="radio" name={`avail-${pluginId}`} className="mt-1" checked={availability === a.value} onChange={() => setAvail(a.value)} />
            <span>
              {a.label} <span className="text-muted">({a.hint})</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button
          disabled={pending}
          onClick={async () => {
            const r = await execute({ availability, defaultEnabled });
            if (r?.ok) {
              setOpen(false);
              router.refresh();
            }
          }}
        >
          {pending ? "Installing…" : "Install plugin"}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function AvailabilityForm({ pluginId, availability: saved, defaultEnabled: savedDefault }: { pluginId: string; availability: string; defaultEnabled: boolean }) {
  const router = useRouter();
  const { execute, pending, error, message } = useAction(adminSetAvailability.bind(null, pluginId));
  // Optimistic: the controls move immediately and go back if saving fails.
  const [availability, setAvailability] = useState(saved);
  const [defaultEnabled, setDefaultEnabled] = useState(savedDefault);
  const save = async (input: { availability?: string; defaultEnabled?: boolean }) => {
    if (input.availability) setAvailability(input.availability);
    if (input.defaultEnabled !== undefined) setDefaultEnabled(input.defaultEnabled);
    const r = await execute(input);
    if (r?.ok) router.refresh();
    else {
      setAvailability(saved);
      setDefaultEnabled(savedDefault);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="mb-1 text-sm font-medium">Available to</legend>
        {AVAILABILITY.map((a) => (
          <label key={a.value} className="flex items-start gap-2 text-sm">
            <input type="radio" name="availability" className="mt-1" checked={availability === a.value} onChange={() => save({ availability: a.value })} />
            <span>
              {a.label} <span className="text-muted">({a.hint})</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={pending} checked={defaultEnabled} onChange={(e) => save({ defaultEnabled: e.target.checked })} />
        Enabled by default (on for each company until its owner turns it off)
      </label>
      {error && <Alert>{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
    </div>
  );
}

/** Per-company allow (SELECTED mode) / block (ALL mode) toggle. */
export function CompanyAccessToggle({ pluginId, companyId, mode, on }: { pluginId: string; companyId: string; mode: "allow" | "block"; on: boolean }) {
  const router = useRouter();
  const { execute, pending, error } = useAction(adminSetCompanyAccess.bind(null, pluginId, companyId));
  const label = mode === "allow" ? (on ? "Remove access" : "Allow") : on ? "Unblock" : "Block";
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant={(mode === "allow" && !on) || (mode === "block" && on) ? "primary" : "secondary"}
        disabled={pending}
        onClick={async () => {
          const r = await execute(mode === "allow" ? { allowed: !on } : { blocked: !on });
          if (r?.ok) router.refresh();
        }}
      >
        {pending ? "…" : label}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

export function UninstallButton({ pluginId, kind }: { pluginId: string; kind: "CODE" | "EXTERNAL" }) {
  const router = useRouter();
  const { execute, pending, error } = useAction(adminUninstallPlugin.bind(null, pluginId));
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={async () => {
          if (!confirm(kind === "EXTERNAL" ? "Uninstall and remove this external plugin? Its settings and data are deleted." : "Uninstall this plugin for everyone?")) return;
          const keepData = kind === "CODE" && confirm("Keep its settings and data so they come back if you reinstall it? (Cancel = delete them)");
          const r = await execute(keepData);
          if (r?.ok) router.push("/admin/plugins");
        }}
      >
        {pending ? "Uninstalling…" : "Uninstall"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

export function AddExternalForm() {
  const router = useRouter();
  const { execute, pending, error } = useAction(adminAddExternalPlugin);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const url = String(new FormData(e.currentTarget).get("url") ?? "");
        const r = await execute(url);
        if (r?.ok) router.push(`/admin/plugins/${r.data.id}`);
      }}
    >
      <Field label="Manifest URL" hint="https:// address of the plugin's manifest.json">
        <Input name="url" type="url" required placeholder="https://plugin.example.com/manifest.json" />
      </Field>
      {error && <Alert>{error}</Alert>}
      <Button disabled={pending} className="self-start">
        {pending ? "Loading…" : "Load plugin"}
      </Button>
    </form>
  );
}

export function RescanButton() {
  const router = useRouter();
  const { execute, pending, message } = useAction(adminRescanPlugins);
  return (
    <span className="inline-flex items-center gap-2">
      {message && <span className="text-xs text-muted">{message}</span>}
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={async () => {
          const r = await execute();
          if (r?.ok) router.refresh();
        }}
      >
        Rescan
      </Button>
    </span>
  );
}
