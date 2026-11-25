/**
 * Must new accounts verify their email before signing in?
 *
 * EMAIL_VERIFICATION="on" | "off" forces it. Unset (or anything else): on only when SMTP is configured —
 * without SMTP the link could never arrive and new users would be stuck.
 */
export function verificationRequired(env: Record<string, string | undefined> = process.env) {
  const v = (env.EMAIL_VERIFICATION ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (["on", "true", "1", "yes"].includes(v)) return true;
  if (["off", "false", "0", "no"].includes(v)) return false;
  return !!(env.SMTP_HOST ?? "").trim();
}
