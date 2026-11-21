import "server-only";
import { cache } from "react";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { formatMobile, MOBILE_ERROR, normalizeMobile, whatsappHref } from "./phone";

/**
 * The public website's contact details, edited by the super admin in Admin → Website (one row in
 * system_state). Anything not saved there falls back to the CONTACT_* environment variables.
 */
export const SITE_CONTACT_KEY = "site.contact";

export interface SiteContact {
  /** Normalised mobile ("+91…"), or "". */
  mobile: string;
  whatsapp: string;
  email: string;
  address: string;
  /** Where Contact-page messages are emailed. */
  notifyEmail: string;
}

const optionalMobile = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return "";
    const m = normalizeMobile(v);
    if (!m) ctx.addIssue({ code: "custom", message: MOBILE_ERROR });
    return m ?? "";
  });
const optionalEmail = z.string().trim().max(160).refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email address");

export const siteContactSchema = z.object({
  mobile: optionalMobile,
  whatsapp: optionalMobile,
  email: optionalEmail,
  address: z.string().trim().max(500),
  notifyEmail: optionalEmail,
});

const env = (k: string) => process.env[k]?.trim() ?? "";

/** Saved values (only the fields that were set), or null. */
async function saved(): Promise<Partial<SiteContact> | null> {
  const row = await db.systemState.findUnique({ where: { key: SITE_CONTACT_KEY } }).catch(() => null);
  const v = row?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<SiteContact>) : null;
}

/** Effective details: saved in Admin → Website, else from the environment. */
export const getSiteContact = cache(async (): Promise<SiteContact> => {
  const s = (await saved()) ?? {};
  const pick = (key: keyof SiteContact, envKey: string) => (typeof s[key] === "string" && s[key] ? (s[key] as string) : env(envKey));
  const email = pick("email", "CONTACT_EMAIL");
  return {
    mobile: normalizeMobile(pick("mobile", "CONTACT_PHONE")) ?? "",
    whatsapp: normalizeMobile(pick("whatsapp", "CONTACT_WHATSAPP")) ?? "",
    email,
    address: pick("address", "CONTACT_ADDRESS"),
    notifyEmail: pick("notifyEmail", "CONTACT_NOTIFY_EMAIL") || email,
  };
});

/** What the website shows: ready-to-use labels and links (empty fields left out). */
export async function getContactDetails() {
  const c = await getSiteContact();
  return {
    email: c.email || null,
    phone: c.mobile ? { label: formatMobile(c.mobile), href: `tel:${c.mobile}` } : null,
    whatsapp: c.whatsapp ? whatsappHref(c.whatsapp) : null,
    address: c.address || null,
  };
}

/** The form's current values: what's saved in Admin → Website (not the env fallback). */
export async function getSavedSiteContact(): Promise<SiteContact> {
  const s = (await saved()) ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return { mobile: str(s.mobile), whatsapp: str(s.whatsapp), email: str(s.email), address: str(s.address), notifyEmail: str(s.notifyEmail) };
}

export async function saveSiteContact(raw: unknown) {
  const value = siteContactSchema.parse(raw);
  const json = value as unknown as Prisma.InputJsonValue;
  await db.systemState.upsert({ where: { key: SITE_CONTACT_KEY }, create: { key: SITE_CONTACT_KEY, value: json }, update: { value: json } });
  return value;
}
