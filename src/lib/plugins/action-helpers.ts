/** Plugin form actions: pure request helpers (CSRF, safe redirects, notices). Unit-tested. */

/** Hosts this app is reached on (the request's own, the proxy's, and APP_URL / BETTER_AUTH_URL). */
function ownHosts(request: Request) {
  const hosts = new Set<string>();
  const add = (v: string | null | undefined) => v && hosts.add(v.toLowerCase());
  add(new URL(request.url).host);
  add(request.headers.get("host"));
  add(request.headers.get("x-forwarded-host")?.split(",")[0]?.trim());
  for (const env of [process.env.APP_URL, process.env.BETTER_AUTH_URL]) {
    try {
      if (env) add(new URL(env).host);
    } catch {
      /* not a URL */
    }
  }
  return hosts;
}

/** CSRF: a browser form post must come from this app. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    try {
      return ownHosts(request).has(new URL(origin).host.toLowerCase());
    } catch {
      return false;
    }
  }
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

/** A path inside this company, or null. */
export function safeCompanyPath(companyId: string, raw: unknown) {
  if (typeof raw !== "string" || !raw) return null;
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      path = u.pathname + u.search;
    } catch {
      return null;
    }
  }
  return path.startsWith(`/c/${companyId}/`) && !path.startsWith("//") && !/[\r\n]/.test(path) ? path : null;
}

/** Adds ?_ok / ?_error to a path (dropping an older message). */
export function withNotice(path: string, kind: "_ok" | "_error", message: string) {
  const u = new URL(path, "http://x");
  u.searchParams.delete("_ok");
  u.searchParams.delete("_error");
  if (message) u.searchParams.set(kind, message.slice(0, 300));
  return u.pathname + u.search;
}
