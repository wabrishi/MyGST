import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { formatMobile, MOBILE_ERROR, normalizeMobile } from "./phone";

/**
 * Website contact form: validation and spam checks (pure, unit-tested). Saving and emailing live in
 * contact-store.ts. Spam protection: a hidden "website" field people never fill, a signed "form shown
 * at" time (sends faster than MIN_FILL_MS are bots), and a per-IP rate limit (in the store).
 */

export const TOPICS = ["sales", "support", "partnership", "other"] as const;
export const MIN_FILL_MS = 3_000;
export const MAX_FORM_AGE_MS = 24 * 3600_000;
export const RATE_LIMIT = { max: 5, windowMs: 3600_000 };

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address").max(160),
  /** Required; stored normalised ("+91XXXXXXXXXX"). */
  phone: z.string({ error: MOBILE_ERROR }).transform((v, ctx) => {
    const phone = normalizeMobile(v);
    if (!phone) ctx.addIssue({ code: "custom", message: MOBILE_ERROR });
    return phone ?? "";
  }),
  company: z.string().trim().max(160).default(""),
  topic: z.enum(TOPICS).catch("other"),
  message: z.string().trim().min(10, "Please write a little more (at least 10 characters)").max(5000, "Please keep it under 5,000 characters"),
});
export type ContactInput = z.infer<typeof contactSchema>;

const secret = () => process.env.BETTER_AUTH_SECRET || "mygst-contact";
const sign = (ts: string) => createHmac("sha256", secret()).update(`contact:${ts}`).digest("base64url").slice(0, 22);

/** Token embedded in the form when it's shown: "<time>.<signature>". */
export function formToken(now = Date.now()) {
  const ts = String(now);
  return `${ts}.${sign(ts)}`;
}

export type SpamVerdict = "ok" | "honeypot" | "too-fast" | "bad-token";

export function spamCheck(fields: { website?: unknown; token?: unknown }, now = Date.now()): SpamVerdict {
  if (typeof fields.website === "string" && fields.website.trim()) return "honeypot";
  const [ts, sig] = String(fields.token ?? "").split(".");
  if (!ts || !sig) return "bad-token";
  const expected = sign(ts);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return "bad-token";
  const age = now - Number(ts);
  if (!Number.isFinite(age) || age > MAX_FORM_AGE_MS || age < 0) return "bad-token";
  if (age < MIN_FILL_MS) return "too-fast";
  return "ok";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The notification email to the team. */
export function contactEmailHtml(m: ContactInput) {
  const row = (k: string, v: string) => (v ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${k}</td><td style="padding:4px 0">${esc(v)}</td></tr>` : "");
  return `<p>New message from the website contact form:</p>
<table style="font:14px sans-serif">${row("Name", m.name)}${row("Email", m.email)}${row("Mobile", formatMobile(m.phone))}${row("Business", m.company)}${row("Topic", m.topic)}</table>
<p style="white-space:pre-wrap;font:14px sans-serif;border-left:3px solid #4f46e5;padding-left:12px">${esc(m.message)}</p>
<p style="color:#64748b;font-size:12px">Reply to ${esc(m.email)}. All messages are also listed in Admin → Messages.</p>`;
}
