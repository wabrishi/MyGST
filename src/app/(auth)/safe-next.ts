/** Only allow same-origin relative redirects after login. */
export function safeNext(next: string | null | undefined, fallback = "/companies") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
