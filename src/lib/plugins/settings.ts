import { decryptSecret, encryptSecret } from "../backup/crypto";
import type { SettingField } from "./manifest";
import type { SettingValue } from "./sdk";

/**
 * Plugin settings per company. Stored as JSON { key: value }, with `secret` fields encrypted as
 * { enc: "<AES-256-GCM>" } so database dumps and backups never contain plugin passwords/tokens in clear.
 */
type Stored = Record<string, unknown>;

const isEnc = (v: unknown): v is { enc: string } => !!v && typeof v === "object" && typeof (v as { enc?: unknown }).enc === "string";

/** Values a plugin sees: stored value, else the manifest default; secrets decrypted. */
export function readSettings(fields: readonly SettingField[], stored: unknown): Record<string, SettingValue> {
  const s = (stored && typeof stored === "object" ? stored : {}) as Stored;
  const out: Record<string, SettingValue> = {};
  for (const f of fields) {
    const v = s[f.key];
    if (f.type === "secret") {
      if (isEnc(v)) {
        try {
          out[f.key] = decryptSecret(v.enc);
        } catch {
          out[f.key] = "";
        }
      } else out[f.key] = typeof f.default === "string" ? f.default : "";
      continue;
    }
    if (v === undefined || v === null) {
      if (f.default !== undefined) out[f.key] = f.default;
      else out[f.key] = f.type === "boolean" ? false : f.type === "number" ? 0 : "";
    } else out[f.key] = v as SettingValue;
  }
  return out;
}

/** What the owner's settings form shows: like readSettings, but secrets are only "set / not set". */
export function settingsForForm(fields: readonly SettingField[], stored: unknown) {
  const s = (stored && typeof stored === "object" ? stored : {}) as Stored;
  const values = readSettings(fields.filter((f) => f.type !== "secret"), stored);
  const secretsSet = Object.fromEntries(fields.filter((f) => f.type === "secret").map((f) => [f.key, isEnc(s[f.key])]));
  return { values, secretsSet };
}

/**
 * Validates form input against the manifest and returns what to store. A blank secret keeps the
 * previous one (the form never shows secrets back); `clearSecrets` lists secrets to remove.
 */
export function prepareSettings(fields: readonly SettingField[], input: Record<string, unknown>, previous: unknown, clearSecrets: string[] = []) {
  const prev = (previous && typeof previous === "object" ? previous : {}) as Stored;
  const out: Stored = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const raw = input[f.key];
    if (f.type === "secret") {
      const v = typeof raw === "string" ? raw.trim() : "";
      if (v) out[f.key] = { enc: encryptSecret(v) };
      else if (!clearSecrets.includes(f.key) && isEnc(prev[f.key])) out[f.key] = prev[f.key];
      if (f.required && !out[f.key]) errors[f.key] = `${f.label} is required`;
      continue;
    }
    if (f.type === "boolean") {
      out[f.key] = raw === true || raw === "true" || raw === "on";
      continue;
    }
    const str = raw === undefined || raw === null ? "" : String(raw).trim();
    if (!str) {
      if (f.required) errors[f.key] = `${f.label} is required`;
      continue;
    }
    if (str.length > (f.type === "textarea" ? 5000 : 1000)) {
      errors[f.key] = `${f.label} is too long`;
      continue;
    }
    if (f.type === "number") {
      const n = Number(str);
      if (!Number.isFinite(n)) errors[f.key] = `${f.label} must be a number`;
      else out[f.key] = n;
    } else if (f.type === "url") {
      try {
        const u = new URL(str);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
        out[f.key] = str;
      } catch {
        errors[f.key] = `${f.label} must be a valid URL`;
      }
    } else if (f.type === "select") {
      if (!f.options?.some((o) => o.value === str)) errors[f.key] = `Choose a valid ${f.label}`;
      else out[f.key] = str;
    } else out[f.key] = str;
  }
  return { stored: out, errors };
}
