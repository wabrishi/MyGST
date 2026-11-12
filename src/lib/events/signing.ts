import { createHmac, randomBytes } from "node:crypto";

/** Pure helpers for suite events (no database) — signing, ids, retry schedule, URL rules. */

export const newEventId = () => `evt_${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;

/** `v1=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>` */
export function signPayload(secret: string, timestamp: number, rawBody: string) {
  return "v1=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Retry schedule after a failed attempt: 1 m, 5 m, 30 m, 2 h, 12 h, then dead. */
export const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];

export function nextAttempt(attempts: number, now = Date.now()): Date | null {
  const delay = BACKOFF_MS[attempts - 1];
  return delay == null ? null : new Date(now + delay);
}

/** Webhook URLs must be https in production (http allowed for localhost in development). */
export function validateWebhookUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "Enter a valid URL";
  }
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname);
  if (process.env.NODE_ENV === "production") {
    if (u.protocol !== "https:") return "The webhook URL must use https://";
    if (local || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(u.hostname)) return "Private network addresses are not allowed";
  } else if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    return "Use https:// (http:// is only allowed for localhost in development)";
  }
  if (u.username || u.password) return "Credentials in the URL are not allowed";
  return null;
}
