import { isStateCode } from "./states";

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const normalizeGstin = (value: string | null | undefined) => String(value ?? "").trim().toUpperCase();

/** Computes the GSTIN check character (mod-36 Luhn variant) for the first 14 characters. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

/** Validates format, state code and check digit of a 15-character GSTIN. */
export function isValidGstin(value: string | null | undefined): boolean {
  const g = normalizeGstin(value);
  if (!/^[0-9]{2}[A-Z0-9]{13}$/.test(g)) return false;
  if (!isStateCode(g.slice(0, 2))) return false;
  return gstinCheckChar(g.slice(0, 14)) === g[14];
}

export const stateFromGstin = (gstin: string) => normalizeGstin(gstin).slice(0, 2);

/** PAN embedded in a GSTIN (characters 3–12). */
export const panFromGstin = (gstin: string) => normalizeGstin(gstin).slice(2, 12);
