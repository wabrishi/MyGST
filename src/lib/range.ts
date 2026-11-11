/** Reads ?from&to (YYYY-MM-DD), falling back to `fallback` (usually the selected financial year). */
export function rangeFrom(sp: Record<string, string | string[] | undefined>, fallback: [string, string]): [string, string] {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = typeof sp.from === "string" && re.test(sp.from) ? sp.from : fallback[0];
  const to = typeof sp.to === "string" && re.test(sp.to) ? sp.to : fallback[1];
  return from <= to ? [from, to] : [to, from];
}
