import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Outgoing HTTP for plugins (ctx.http.fetch, external plugin webhooks/manifests). In production it refuses
 * private, loopback and link-local addresses, so a plugin setting or manifest can't be used to reach
 * the server's internal network (SSRF). Redirects are not followed.
 */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::") return true;
    if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x);
  }
  return true; // not an IP at all
}

export async function assertPublicUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http(s) URLs are allowed");
  if (process.env.NODE_ENV !== "production") return u;
  if (u.protocol !== "https:") throw new Error("Only https:// URLs are allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new Error("URL points to a private network address");
  return u;
}

export async function safeFetch(url: string, init: RequestInit = {}, timeoutMs = 10_000) {
  await assertPublicUrl(url);
  return fetch(url, { ...init, redirect: "manual", signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
}
