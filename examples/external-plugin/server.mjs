// Example EXTERNAL MyGST plugin: "Event log". Plain Node 22, no dependencies.
//
//   node examples/external-plugin/server.mjs            (listens on http://localhost:4100)
//   Admin → Plugins → Add an external plugin → http://localhost:4100/manifest.json
//
// What it shows (see docs/plugins/README.md#external-plugins):
//   - manifest.json served by the plugin
//   - POST /webhook: verifies X-MyGST-Signature, handles plugin.installed / plugin.uninstalled and events
//   - GET  /ui/<page> and /widgets/<id>: framed pages; verifies the ?mygst_token= page token
//   - POST /validate: the optional document.validate hook (HTTP 422 { error } blocks the save)
//   - calling the MyGST API with the key received in plugin.installed
// Storage is a JSON file next to this script. Don't use this as-is in production (no HTTPS, no locking).
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4100);
const BASE_URL = (process.env.BASE_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, "");
const DB_FILE = new URL("./data.json", import.meta.url);

/** { [companyId]: { apiKey, apiBaseUrl, secret, company, events: [] } } */
const db = existsSync(DB_FILE) ? JSON.parse(readFileSync(DB_FILE, "utf8")) : {};
const save = () => writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

const manifest = {
  id: "event-log",
  name: "Event log (example)",
  version: "1.0.0",
  description: "Example external plugin: keeps a log of invoices, quotations and payments, shows it as a page and a dashboard widget, and blocks invoices whose notes say BLOCK.",
  author: "MyGST examples",
  icon: "ClipboardList",
  permissions: ["documents:read", "payments:read"],
  events: ["invoice.issued", "quotation.created", "payment.received"],
  filters: ["document.validate"],
  webhookUrl: `${BASE_URL}/webhook`,
  validateUrl: `${BASE_URL}/validate`,
  pageBaseUrl: `${BASE_URL}/ui`,
  pages: [{ slug: "events", title: "Event log", icon: "ClipboardList" }],
  widgets: [{ id: "recent", title: "Recent events", width: "third" }],
};

// ── Security helpers ──────────────────────────────────────────────────────────

const sign = (secret, ts, body) => "v1=" + createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Verifies X-MyGST-Signature over "<timestamp>.<raw body>" within 5 minutes. */
function verifyEvent(secret, req, raw) {
  const ts = Number(req.headers["x-mygst-timestamp"]);
  const sig = String(req.headers["x-mygst-signature"] ?? "");
  return !!secret && ts > 0 && Math.abs(Date.now() / 1000 - ts) <= 300 && same(sig, sign(secret, ts, raw));
}

/** Verifies the page token MyGST appends to framed pages: base64url(payload).base64url(HMAC). */
function verifyPageToken(token) {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const secret = db[payload.companyId]?.secret; // which company's secret to check with
  if (!secret) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!same(sig, expected) || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

const readBody = (req) => new Promise((resolve) => {
  let s = "";
  req.on("data", (c) => (s += c));
  req.on("end", () => resolve(s));
});
const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const page = (title, inner) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
  :root { color-scheme: light dark; font: 14px/1.5 system-ui, sans-serif; }
  body { margin: 0; padding: 16px; } table { width: 100%; border-collapse: collapse; }
  td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #8883; } .muted { opacity: .65; }
</style></head><body>${inner}</body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", BASE_URL);
  try {
    if (req.method === "GET" && url.pathname === "/manifest.json") return send(res, 200, manifest);

    if (req.method === "POST" && url.pathname === "/webhook") {
      const raw = await readBody(req);
      const event = JSON.parse(raw);
      if (event.type === "plugin.installed") {
        // The first message carries the secret it is signed with; verify against that secret.
        if (!verifyEvent(event.data?.webhookSecret, req, raw)) return send(res, 401, { error: "bad signature" });
        db[event.companyId] = { apiKey: event.data.apiKey, apiBaseUrl: event.data.apiBaseUrl, secret: event.data.webhookSecret, company: event.data.company, events: db[event.companyId]?.events ?? [] };
        save();
        console.log(`installed for ${event.data.company?.legalName} (${event.companyId})`);
        return send(res, 200, { ok: true });
      }
      const tenant = db[event.companyId];
      if (!tenant || !verifyEvent(tenant.secret, req, raw)) return send(res, 401, { error: "bad signature" });
      if (event.type === "plugin.uninstalled") {
        delete db[event.companyId];
        save();
        return send(res, 200, { ok: true });
      }
      // Events can arrive more than once: dedupe by id.
      if (!tenant.events.some((e) => e.id === event.id)) {
        tenant.events.unshift({ id: event.id, type: event.type, at: event.occurredAt, number: event.data.number, amount: event.data.amount, url: event.data.url });
        tenant.events = tenant.events.slice(0, 100);
        save();
      }
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/validate") {
      const raw = await readBody(req);
      const body = JSON.parse(raw);
      const tenant = db[body.companyId];
      if (!tenant || !verifyEvent(tenant.secret, req, raw)) return send(res, 401, { error: "bad signature" });
      if (body.data?.type === "INVOICE" && /\bBLOCK\b/.test(body.data?.input?.notes ?? "")) return send(res, 422, { error: "Notes say BLOCK, so this invoice was stopped by the example plugin." });
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && (url.pathname.startsWith("/ui/") || url.pathname.startsWith("/widgets/"))) {
      const who = verifyPageToken(url.searchParams.get("mygst_token"));
      if (!who) return send(res, 401, page("Not allowed", "<p>Open this page from inside MyGST.</p>"), "text/html");
      const tenant = db[who.companyId];
      const rows = (tenant?.events ?? []).slice(0, url.pathname.startsWith("/widgets/") ? 5 : 100);
      const table = rows.length
        ? `<table><tr><th>When</th><th>Event</th><th>Number</th><th>Amount</th></tr>${rows
            .map((e) => `<tr><td class="muted">${esc(e.at?.slice(0, 16).replace("T", " "))}</td><td>${esc(e.type)}</td><td>${e.url ? `<a href="${esc(e.url)}" target="_top">${esc(e.number)}</a>` : esc(e.number)}</td><td>₹${esc(e.amount)}</td></tr>`)
            .join("")}</table>`
        : `<p class="muted">No events yet. Issue an invoice in MyGST.</p>`;
      const header = url.pathname.startsWith("/ui/") ? `<p class="muted">Signed in as ${esc(who.name)} (${esc(who.role)}) · ${esc(tenant?.company?.legalName)}</p>` : "";
      return send(res, 200, page("Event log", header + table), "text/html");
    }

    return send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "internal error" });
  }
}).listen(PORT, () => console.log(`Event log plugin on ${BASE_URL}  (manifest: ${BASE_URL}/manifest.json)`));
