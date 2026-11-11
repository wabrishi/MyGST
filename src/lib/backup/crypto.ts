import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Secrets for backups. BACKUP_ENCRYPTION_KEY is preferred; falls back to BETTER_AUTH_SECRET so
 * local dev works out of the box. Changing the key means re-connecting backup destinations.
 */
function masterKey() {
  const secret = process.env.BACKUP_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BACKUP_ENCRYPTION_KEY (or BETTER_AUTH_SECRET) must be set");
  return createHash("sha256").update(`mygst-backup:${secret}`).digest();
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(enc: string): string {
  const [iv, tag, data] = enc.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !data) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Signed, expiring token used as the OAuth `state` parameter (CSRF + carries the scope). */
export function signState(payload: Record<string, string>, ttlSeconds = 600): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const sig = createHmac("sha256", masterKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(token: string): Record<string, string> | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", masterKey()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, string> & { exp: number };
  if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
  return payload;
}
