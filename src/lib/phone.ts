/**
 * Mobile numbers: one rule for sign-up, profiles, the contact form and the website's details.
 * Indian mobiles are stored as "+91XXXXXXXXXX"; overseas numbers typed with "+<country code>" are kept.
 * Pure (safe in client components).
 */

export const MOBILE_ERROR = "Enter a valid 10-digit mobile number";

/** "+919876543210" from "98765 43210", "+91 98765-43210", "09876543210" or "919876543210"; null if invalid. */
export function normalizeMobile(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // Digits with the usual separators; at most one "+", only at the start (brackets may come first).
  if (!trimmed || !/^\(?\+?[\d\s().-]+$/.test(trimmed) || (trimmed.match(/\+/g)?.length ?? 0) > 1) return null;
  const digits = trimmed.replace(/\D/g, "");
  let local: string | null = null;
  if (digits.length === 10) local = digits;
  else if (digits.length === 11 && digits.startsWith("0")) local = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith("91")) local = digits.slice(2);
  if (local) return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
  // Overseas: must be written with "+" and its country code (not +91, which needs 10 digits).
  if (trimmed.replace(/^\(/, "").startsWith("+") && !digits.startsWith("91") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** "+91 98765 43210" for display (other numbers as stored). */
export function formatMobile(stored: string | null | undefined) {
  if (!stored) return "";
  const m = /^\+91(\d{5})(\d{5})$/.exec(stored);
  return m ? `+91 ${m[1]} ${m[2]}` : stored;
}

/** For tel: and wa.me links. */
export const telHref = (stored: string) => `tel:${stored}`;
export const whatsappHref = (stored: string) => `https://wa.me/${stored.replace(/\D/g, "")}`;
