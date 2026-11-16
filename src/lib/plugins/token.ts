import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived token passed to an external plugin's framed page/widget as ?mygst_token=…
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(webhookSecret, payloadPart)).
 * The plugin verifies it with the webhook secret it received in plugin.installed (see docs/plugins).
 */
export interface PageTokenPayload {
  plugin: string;
  companyId: string;
  userId: string;
  name: string;
  role: string;
  /** Page slug or "widget:<id>". */
  view: string;
  exp: number;
}

export function signPageToken(secret: string, payload: Omit<PageTokenPayload, "exp">, ttlSeconds = 300, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSeconds })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPageToken(secret: string, token: string, now = Date.now()): PageTokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PageTokenPayload;
    return typeof p.exp === "number" && p.exp * 1000 > now ? p : null;
  } catch {
    return null;
  }
}
