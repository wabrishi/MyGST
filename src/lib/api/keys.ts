import { createHash, randomBytes } from "node:crypto";

/** API key format: "mgk_" + 43 base64url chars (32 random bytes). Only the SHA-256 hash is stored. */
export const KEY_PREFIX = "mgk_";

export function generateApiKey() {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 12) };
}

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

export const looksLikeApiKey = (key: string) => key.startsWith(KEY_PREFIX) && key.length >= 40 && key.length <= 80;
