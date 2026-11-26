/**
 * Absolute URL on the app's public address (APP_URL / BETTER_AUTH_URL).
 * Behind a hosting proxy `request.url` is the internal address (e.g. http://0.0.0.0:3000),
 * so redirects must not be built from it. Falls back to the request when neither is set (local dev).
 */
export function publicUrl(path: string, request: Request | string): URL {
  const base = (process.env.APP_URL || process.env.BETTER_AUTH_URL || "").trim().replace(/^["']|["']$/g, "");
  return new URL(path, base || (typeof request === "string" ? request : request.url));
}
