# MyGST plugin developer guide

Plugins add features to MyGST without changing its core. They can:
- react to invoices, payments and other events
- check or enrich documents before they are saved
- add sections to the invoice PDF
- add pages, dashboard widgets, report entries and settings
- keep their own data

This guide covers how to build, test and ship one.

**Contents**
- [How plugins work](#how-plugins-work)
- [Quick start (code plugin)](#quick-start-code-plugin)
- [Manifest reference](#manifest-reference)
- [Hooks: actions](#actions-events)
- [Hooks: filters](#filters)
- [Pages, widgets, settings and routes](#pages-widgets-settings-and-routes)
- [The `ctx` object](#the-ctx-object)
- [Security rules](#security-rules)
- [Testing](#testing)
- [External plugins](#external-plugins)
- [Versioning, upgrades and uninstalling](#versioning-upgrades-and-uninstalling)
- [Submission checklist](#submission-checklist)

---

## How plugins work

### Two kinds of plugin

|                 | **Code plugin** | **External plugin** |
|-----------------|-----------------|---------------------|
| Lives in        | `src/plugins/<id>/` in this repo, or **uploaded** as a packed file | Your own server, any language |
| Installed by    | Deploying (or **Admin → Plugins → Upload a plugin**), then **Install** | **Admin → Plugins → Add an external plugin** (manifest URL), then Install |
| Can do          | Everything in this guide | Events, the `document.validate` hook, pages and widgets shown in a frame, the `/api/v1` API |
| Talks to MyGST  | In-process, through the SDK (`@/lib/plugins/sdk`) | Signed HTTP calls in both directions |
| Good for        | Features that change how MyGST works | Integrations with other systems, and work by third parties |

A code plugin can reach MyGST in two ways: merged into this repo and deployed, or **packed and uploaded** by an admin (see [Package & upload](#package--upload)). Uploaded code is trusted code, like a WordPress plugin: it runs inside MyGST.

### Who switches what

1. **Super admin** (platform operator)
   - Installs the plugin and answers *"Enable by default for every company?"*
   - Sets **Available to**:
     - **All companies**: each company can still be *blocked* individually.
     - **Selected companies**: only companies the admin *allows*.
     - **Nobody**: a kill switch.
   - Can change all of this at any time on the plugin's admin page or on a company's admin page.
2. **Company owner**
   - Sees available plugins in **Settings → Plugins** and turns each on or off.
   - Accepts its permissions when turning it on.
   - Fills in its settings.
   - Plugins that are "enabled by default" start switched on, and the owner can still turn them off.

A plugin runs for a company only when it is installed, available to that company, switched on, and not paused. That rule lives in one function: `isPluginActive()` in `src/lib/plugins/access.ts`.

### Failure isolation

Every hook runs with a timeout and its own error handling:
- A plugin that throws never breaks an invoice save, a page or the PDF.
- Errors appear in the plugin's log, in **Admin → Plugins → (plugin)** and on the owner's settings page.
- After 20 failures in a row, the plugin is **paused** for that company until the owner turns it back on.

---

## Quick start (code plugin)

```bash
npm run plugin:new -- sms-alerts "SMS alerts"
```

This creates:
- `src/plugins/sms-alerts/index.ts`: the manifest and `setup()`.
- `src/plugins/sms-alerts/README.md`: describe your plugin for admins.
- `tests/unit/plugins/sms-alerts.test.ts`: a working test to start from.

It also refreshes `src/plugins/registry.generated.ts`, the build's list of plugins. Don't edit that file; `npm run dev` and `npm run build` regenerate it.

A complete plugin:

```ts
import { definePlugin } from "@/lib/plugins/sdk";

export default definePlugin({
  manifest: {
    id: "sms-alerts",                    // must equal the folder name
    name: "SMS alerts",
    version: "1.0.0",
    description: "Texts the owner when a payment arrives.",
    permissions: ["payments:read"],      // what it may read/change; owners see this list
    events: ["payment.received"],        // action hooks it listens to
    settings: [
      { key: "apiKey", label: "SMS provider API key", type: "secret", required: true },
      { key: "phone", label: "Send to (mobile)", type: "text", required: true },
    ],
  },
  setup(api) {
    api.on("payment.received", async (event, ctx) => {
      if (await ctx.storage.get(`sent:${event.id}`)) return;           // events can repeat
      const res = await ctx.http.fetch("https://sms.example.com/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${ctx.settings.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: ctx.settings.phone, text: `Payment of ₹${event.data.amount} received` }),
      });
      if (!res.ok) throw new Error(`SMS failed: HTTP ${res.status}`); // thrown = retried later
      await ctx.storage.set(`sent:${event.id}`, true);
    });
  },
});
```

Try it:
1. Run `npm run dev`.
2. Go to **Admin → Plugins**. Your plugin appears as *Not installed*.
3. Install it, open a company → **Settings → Plugins**, fill in the settings, and record a payment.

Working examples ship in the repo:

| Plugin | Shows |
|---|---|
| `src/plugins/invoice-footer` | settings, the `pdf.sections` filter, a dashboard widget, `ctx.data` |
| `src/plugins/slack-notify` | action hooks, a secret setting, `ctx.http`, idempotency with `ctx.storage` |
| `src/plugins/po-number` | `document.validate`, `document.beforeSave`, custom fields printed on the PDF, a sidebar page, `document.actions` |
| `examples/external-plugin` | the whole external protocol, with no dependencies |

---

## Manifest reference

| Field | Type | Notes |
|---|---|---|
| `id` | string | **Required.** 3–42 characters: lowercase letters, digits and `-`, starting with a letter. Never change it after release. |
| `name` | string | **Required.** 2–60 characters. |
| `version` | semver | **Required.** For example `1.2.0`. |
| `description`, `author`, `homepage` | string | Shown to admins and owners. |
| `icon` | string | A [lucide](https://lucide.dev/icons) name for menus. Supported: `Puzzle`, `Bell`, `Blocks`, `Boxes`, `Calculator`, `Calendar`, `ClipboardList`, `Cloud`, `Mail`, `MessageSquare`, `QrCode`, `Send`, `Truck`, `Wallet`, `BarChart3`, `FileText`, `Package`, `ReceiptIndianRupee`, `ScrollText`, `ShoppingCart`, `Users`, `Settings`, `LayoutDashboard`. Anything else shows `Puzzle`. |
| `minAppVersion` | semver | Install is refused on older MyGST versions. |
| `permissions` | string[] | See the table below. Ask only for what you use. |
| `events` | string[] | [Actions](#actions-events) to receive. Each needs its matching permission. |
| `filters` | string[] | [Filters](#filters) the plugin implements. |
| `settings` | field[] | `{ key, label, type, help?, required?, default?, options? }`. `type` is one of `text`, `textarea`, `number`, `boolean`, `select` (needs `options: [{ value, label }]`), `secret` or `url`. MyGST renders the form. `secret` values are encrypted at rest and never shown again. |
| `pages` | page[] | `{ slug, title, icon?, roles?, inNav? }`. The URL is `/c/<company>/apps/<id>/<slug>`. `roles` defaults to all three (`OWNER`, `ACCOUNTANT`, `STAFF`). `inNav` (default true) adds it under **Apps** in the sidebar. |
| `widgets` | widget[] | `{ id, title, roles?, width? }` on the dashboard. `width` is `third` (default), `half` or `full`. |
| `webhookUrl`, `pageBaseUrl`, `validateUrl` | https URL | **External plugins only.** See [External plugins](#external-plugins). |

### Permissions

| Permission | Grants |
|---|---|
| `company:read` | `ctx.data.company()`; `company.updated` events |
| `documents:read` | `ctx.data.documents.list/get`; invoice, quotation and note events; `GET /api/v1/documents` |
| `documents:write` | `ctx.data.documents.setCustomField/createQuotation`; `POST /api/v1/quotations` |
| `parties:read` | `ctx.data.parties.list`; `party.saved` |
| `parties:write` | `ctx.data.parties.upsert`; `POST /api/v1/parties/upsert` |
| `products:read` | `ctx.data.products.list`; `product.saved` |
| `payments:read` | `ctx.data.payments.receivables`; `payment.received`, `payment.paid` |
| `purchases:read` | `ctx.data.purchases.list`; `purchase.saved` |
| `reports:read` | Reserved for report data (not yet exposed) |

Calling a `ctx.data` method without its permission throws an error that names the missing permission.

---

## Actions (events)

Actions run **after** the change is saved:
- They go through the transactional outbox, so an event exists only if the change committed.
- They are delivered right after the request, and retried by the `/api/cron/tick` job after 1 min, 5 min, 30 min, 2 h and 12 h before giving up.
- Each handler has **30 seconds**.
- Handlers for one plugin run in `priority` order (lower first, default 10).

```ts
api.on("invoice.issued", async (event, ctx) => { … }, { priority: 5 });
```

`event` is `{ id, type, occurredAt, companyId, data }`. **Delivery is at least once:** use `event.id` to skip duplicates (see `slack-notify`).

| Event | `data` (amounts in rupees) |
|---|---|
| `invoice.issued` | `id, number, total, amount, status, url, date, partyId, leadRef?` |
| `invoice.cancelled` | `id, number, total, status: "CANCELLED", url, partyId, leadRef?` |
| `quotation.created` | `id, number, total, status: "OPEN", url, date, partyId, leadRef?` |
| `quotation.converted` | `id, number, total, url, partyId, invoiceId, invoiceNumber, invoiceUrl` |
| `credit_note.issued`, `debit_note.issued` | `id, number, total, url, date, partyId, originalInvoiceId, reason` |
| `payment.received` | `id, number (reference), amount, url, partyId, invoiceIds[], date, leadRef?` |
| `payment.paid` | `id, number (reference), amount, url, partyId, billIds[], date` |
| `purchase.saved` | `id, number (supplier bill no.), total, status: CREATED or UPDATED, url, partyId, date, itcType` |
| `party.saved` | `id, status, name, type, gstin, phone, email, stateCode, url` |
| `product.saved` | `id, status, name, hsnSac, salePrice, gstRate, url` |
| `company.updated` | `id, name, gstin, stateCode` |

Throwing from a handler marks the delivery failed, and it is retried. Return normally when there's nothing to do.

### Lifecycle

```ts
api.lifecycle({
  onInstall: async () => {},        // super admin installed it (once, platform-wide)
  onUninstall: async () => {},
  onEnable: async (ctx) => {},      // it became active for a company
  onDisable: async (ctx) => {},     // it stopped being active there (owner, admin, kill switch, uninstall)
});
```

---

## Filters

Filters run **inside the request**:
- Each one receives a value and returns it, possibly changed.
- Each has **2 seconds**.
- A failing filter is skipped (fail-open). The one exception is a `PluginError` thrown from `document.validate`.

```ts
api.filter("pdf.sections", (sections, args, ctx) => [...sections, { title: "Note", lines: ["…"] }]);
```

| Filter | Value → return | Args | Use |
|---|---|---|---|
| `document.validate` | `void` | `{ type, documentId, input, party }` | `throw new PluginError("message")` stops the save and shows the message. |
| `document.beforeSave` | `{ notes, customFields }` | same | Set notes or **custom fields** (see below). |
| `pdf.sections` | `PdfSection[]` (`{ title?, lines[] }`) | `{ document }` | Extra blocks printed above the bank/signature area. At most 5 sections of 10 lines each. |
| `document.actions` | `LinkItem[]` (`{ label, href }`) | `{ document }` | Links in the side panel of a document page. |
| `reports.list` | `LinkItem[]` (`{ label, href, description? }`) | `{}` | Extra cards on the Reports page. |
| `nav.items` | `LinkItem[]` | `{}` | Extra sidebar links, in addition to `pages` with `inNav`. |

`href` can be a path inside the company, such as `apps/my-plugin/report?x=1`, or an absolute `https://` URL, which opens in a new tab.

**Custom fields.** `document.beforeSave` may add, change or remove fields **under its own prefix** (`"<plugin-id>.<key>"`); other keys are ignored. Each field is `{ label, value, onPdf? }`. Fields show on the document page, and the ones with `onPdf: true` also print on the PDF. Event handlers can set them later with `ctx.data.documents.setCustomField(id, key, field)`.

```ts
api.filter("document.beforeSave", (value, { input }) => ({
  ...value,
  customFields: { ...value.customFields, "my-plugin.ref": { label: "Ref", value: "X1", onPdf: true } },
}));
```

---

## Pages, widgets, settings and routes

Pages and widgets are **async React server components**. They render on the server, can `await ctx.data…`, and use the app's Tailwind classes (`text-muted`, `bg-surface`, `border-border`, `text-primary`, …).

```tsx
// manifest: pages: [{ slug: "report", title: "My report" }], widgets: [{ id: "total", title: "Total" }]
api.page("report", async ({ ctx, path, searchParams }) => {
  const docs = await ctx.data.documents.list({ type: "INVOICE", limit: 50 });
  return <ul>{docs.map((d) => <li key={d.id}>{d.number}</li>)}</ul>;
});

api.widget("total", async ({ ctx }) => <div className="text-3xl font-semibold">…</div>);

// Extra UI under the generated settings form (Settings → Plugins):
api.settingsPage(async ({ ctx }) => <p className="text-sm text-muted">Connected as …</p>);
```

The page and widget contract:
- A page is shown at `/c/<company>/apps/<plugin>/<slug>/<…path>` inside the normal app layout. MyGST checks membership and the page's `roles`.
- If a page or widget throws, users see a short notice and the error is logged.
- Pages are server components. For client-side interactivity, put a `"use client"` component in your plugin folder and render it from the page.

**HTTP routes** are for webhooks from other services, or for your client components to call:

```ts
api.route("POST", "sms-status", async (request, { ctx, path, contextFor }) => Response.json({ ok: true }), { public: true });
api.route("GET", "export/*", async (request, { ctx, path }) => new Response("…"), { roles: ["OWNER", "ACCOUNTANT"] });
```

- The URL is `/api/plugins/<id>/<path>`. A path ending in `/*` matches anything below it, and the rest arrives in `path`.
- **Signed-in routes** (the default) need `?companyId=<id>`. MyGST checks that the caller is a member there with one of `roles`, and that the plugin is active. `ctx` is then that user's context.
- **Public routes** (`{ public: true }`) get `ctx: null`. Authenticate the caller yourself, for example with a shared secret stored in your settings. Then use `await contextFor(companyId)`, which returns `null` unless your plugin is active for that company.

---

## The `ctx` object

| Member | Description |
|---|---|
| `pluginId`, `companyId`, `company` | The company the hook runs for (`id, legalName, tradeName, gstin, stateCode`). |
| `user`, `role` | The signed-in user for pages, widgets, routes and filters. `null` in events (background work runs as the owner who enabled the plugin). |
| `settings` | This company's settings for your plugin, with secrets decrypted and defaults applied. |
| `storage.get/set/delete/list(prefix)` | JSON key-value storage, separate for each plugin **and** each company. Keys are 1–191 characters of `[A-Za-z0-9._:/-]`; values are at most 64 KB. |
| `data.company()` | Company profile (`company:read`). |
| `data.documents.list({ type?, from?, to?, partyId?, limit? })`, `.get(id)` | Sales documents. `get` returns the full document with items (money in **paise**). |
| `data.documents.setCustomField(id, key, field \| null)` | Set or remove your custom field (`documents:write`). |
| `data.documents.createQuotation(body)` | Same body as `POST /api/v1/quotations` (`documents:write`). |
| `data.parties.list({ search?, limit? })`, `.upsert(body)` | Customers and suppliers. `upsert` takes the same body as `POST /api/v1/parties/upsert`. |
| `data.products.list(…)`, `data.payments.receivables(partyId?)`, `data.purchases.list(…)` | Read-only lists (amounts in rupees). |
| `http.fetch(url, init)` | `fetch` with a 10 s timeout. It does not follow redirects, and in production it refuses private and loopback addresses. |
| `log.info/warn/error(message)` | Written to the plugin log that admins see (keep it short, never log secrets). |
| `appUrl(path)` | An absolute MyGST URL, for links in messages. |

Plugins never get a database client. Everything is scoped to `ctx.companyId`.

---

## Security rules

**Must**
1. Import only `@/lib/plugins/sdk` from MyGST, plus your own files and npm packages. A lint rule enforces this in `src/plugins/**`. No `@/lib/db`, no Prisma, no imports from other plugins or from `src/app`.
2. Never take a company id from user input or a request body. Use `ctx.companyId`. In public routes, map the caller to a company only after authenticating it.
3. Declare only the permissions you use. Owners see them, and an upgrade that adds permissions is visible to the admin.
4. Keep secrets in `secret` settings, never in code, logs, custom fields or `storage` values that you display.
5. Make event handlers **idempotent** (dedupe on `event.id`), because events are delivered at least once.
6. Respect the timeouts: no long loops in filters, and no sleeping. Hand slow work to an event handler or an external service.
7. Escape anything you render that came from users or other systems. React does this for you unless you use `dangerouslySetInnerHTML`, which you must not.
8. Call outside services only through `ctx.http.fetch`.

**Should**
- Return the incoming value unchanged from a filter when you have nothing to add.
- Keep custom field values short (they are clipped to 300 characters) and labels clear.
- Write a `README.md` in the plugin folder: what it does, its settings, and why it needs each permission.

---

## Testing

`@/lib/plugins/testing` runs plugins with no database or server:

```ts
import { describe, expect, it } from "vitest";
import plugin from "@/plugins/sms-alerts";
import { createPluginTestContext, loadForTest } from "@/lib/plugins/testing";

describe("sms-alerts", () => {
  it("texts once per payment", async () => {
    const p = loadForTest(plugin);                       // validates the manifest + collects hooks
    const ctx = createPluginTestContext({
      manifest: p.manifest,
      settings: { apiKey: "k", phone: "9999999999" },
      fetch: async () => new Response("ok"),             // stub outgoing HTTP
      data: { payments: { receivables: async () => [] } }, // stub only what you use
    });
    await p.emit("payment.received", { amount: 500 }, ctx, "evt_1");
    await p.emit("payment.received", { amount: 500 }, ctx, "evt_1");
    expect(ctx.requests).toHaveLength(1);                // http calls are recorded
  });

  it("adds a PDF line", async () => {
    const p = loadForTest(plugin);
    const ctx = createPluginTestContext({ manifest: p.manifest });
    const doc = { id: "d", type: "INVOICE", number: "INV/1", date: "2026-11-16", status: "ISSUED", partyId: "p", partyName: "A", partyGstin: "", total: 100, customFields: {} } as const;
    expect(await p.applyFilter("pdf.sections", [], { document: doc }, ctx)).toEqual([]);
  });
});
```

What the helpers give you:
- `ctx.logs`, `ctx.store` (storage) and `ctx.requests` are inspectable.
- Unstubbed `ctx.data` methods throw a clear error.

Run your tests with `npx vitest run tests/unit/plugins`. The repo's own tests for the example plugins are in `tests/unit/plugins.test.ts` and `tests/integration/plugins.test.ts`. On Windows, run Vitest from PowerShell or cmd, not Git Bash.

---

## External plugins

An external plugin is a web service that MyGST talks to over HTTPS. Any language works; `examples/external-plugin/server.mjs` is a complete reference in about 150 lines.

### 1. Manifest

Serve a JSON manifest. It uses the same fields as above, plus:

```json
{
  "id": "event-log",
  "name": "Event log",
  "version": "1.0.0",
  "permissions": ["documents:read", "payments:read"],
  "events": ["invoice.issued", "payment.received"],
  "filters": ["document.validate"],
  "webhookUrl": "https://plugin.example.com/webhook",
  "validateUrl": "https://plugin.example.com/validate",
  "pageBaseUrl": "https://plugin.example.com/ui",
  "pages": [{ "slug": "events", "title": "Event log" }],
  "widgets": [{ "id": "recent", "title": "Recent events" }]
}
```

Rules for the manifest:
- All URLs must be `https://`. Plain `http://localhost` is allowed only outside production.
- In production, URLs that resolve to private addresses are refused.
- `document.validate` is the only filter available to external plugins.
- The admin can click **Load plugin** again with the same URL to pick up a new version.

### 2. Install handshake

When the plugin becomes active for a company, MyGST POSTs this to `webhookUrl`:

```json
{
  "id": "evt_…", "type": "plugin.installed", "source": "gst", "companyId": "cmx…", "occurredAt": "…",
  "data": {
    "company": { "id": "cmx…", "legalName": "…", "tradeName": "…", "gstin": "…", "stateCode": "27" },
    "apiKey": "mgk_…", "apiBaseUrl": "https://mygst.example.com/api/v1",
    "webhookSecret": "whsec_…", "permissions": ["documents:read"]
  }
}
```

How to handle it:
- **Store `apiKey` and `webhookSecret` for that `companyId`.** Each company gets its own pair.
- This message is signed with the new `webhookSecret`, so verify it with `data.webhookSecret`.
- If you missed it, the owner can click **Reconnect** in Settings → Plugins. That issues a fresh key and secret, and the old key stops working.

When the plugin stops being active for the company, you get `plugin.uninstalled` and the API key is revoked.

### 3. Events

Each event is a POST to `webhookUrl` with this envelope:

```json
{ "id": "evt_…", "type": "invoice.issued", "source": "gst", "companyId": "cmx…", "occurredAt": "2026-11-16T07:00:00.000Z", "data": { … } }
```

Headers:
- `X-MyGST-Event-Id`
- `X-MyGST-Timestamp`: Unix seconds
- `X-MyGST-Signature: v1=<hex HMAC-SHA256(webhookSecret, "<timestamp>.<raw body>")>`

How to respond:
- Reject the request if the signature doesn't match or the timestamp is more than 5 minutes old.
- Answer `2xx` quickly.
- Any other status, or a timeout after 10 seconds, is retried after 1 min, 5 min, 30 min, 2 h and 12 h.
- Dedupe on `id`.

Node:

```js
import { createHmac, timingSafeEqual } from "node:crypto";
function verify(secret, req, rawBody) {
  const ts = Number(req.headers["x-mygst-timestamp"]);
  const expected = "v1=" + createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  const given = String(req.headers["x-mygst-signature"] ?? "");
  return Math.abs(Date.now() / 1000 - ts) <= 300 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
```

PHP:

```php
function verify(string $secret, string $rawBody): bool {
  $ts = (int)($_SERVER['HTTP_X_MYGST_TIMESTAMP'] ?? 0);
  $expected = 'v1=' . hash_hmac('sha256', $ts . '.' . $rawBody, $secret);
  return abs(time() - $ts) <= 300 && hash_equals($expected, $_SERVER['HTTP_X_MYGST_SIGNATURE'] ?? '');
}
```

### 4. Validate hook (optional)

With `"filters": ["document.validate"]` and a `validateUrl`, MyGST POSTs this before saving a document:

```json
{ "type": "document.validate", "companyId": "…", "plugin": "event-log", "data": { "type": "INVOICE", "documentId": null, "input": { … }, "party": { … } } }
```

It is signed the same way. How MyGST treats the response:
- **HTTP 422 with `{ "error": "message" }`** blocks the save and shows the message.
- Anything else lets it through, including errors and a timeout after **3 seconds**. Keep this endpoint fast.

### 5. Pages and widgets

Pages are framed from `<pageBaseUrl>/<slug>/<…path>`, and widgets from `<pageBaseUrl>/widgets/<id>`. MyGST appends `?mygst_token=<token>`. The token is `base64url(payload) + "." + base64url(HMAC-SHA256(webhookSecret, base64url(payload)))`, where the payload is:

```json
{ "plugin": "event-log", "companyId": "cmx…", "userId": "…", "name": "Asha", "role": "OWNER", "view": "events", "exp": 1794000000 }
```

To verify it:
1. Decode the payload to find `companyId`.
2. Check the signature with that company's secret.
3. Reject the token if it is expired (it is valid for 5 minutes).

Only then show data. Frames are sandboxed (`allow-scripts allow-forms allow-same-origin allow-popups`). Use `target="_top"` for links back into MyGST.

### 6. Calling the API

Use `Authorization: Bearer <apiKey>` against `apiBaseUrl`. The key only works for the permissions in your manifest; a route outside them returns `403`. Endpoints:

| Endpoint | Permission |
|---|---|
| `POST /parties/upsert` | `parties:write` |
| `POST /quotations` | `documents:write` (supports an `Idempotency-Key` header) |
| `GET /documents?leadRef=…` | `documents:read` |

---

## Package & upload

Admins can add a code plugin without a deploy:

1. Build and test it as usual in `src/plugins/<id>/`.
2. Pack it:
   ```bash
   npm run plugin:pack -- <id>                 # → dist-plugins/<id>-<version>.mygst-plugin.js
   npm run plugin:pack -- <id> --id <new-id>   # same code under another id (e.g. to test next to the built-in copy)
   ```
   The packer bundles your folder and its npm dependencies into one CommonJS file and prints its **SHA-256**. Publish that checksum with the file.
   `react`, `react/jsx-runtime` and `@/lib/plugins/sdk` are left out: MyGST provides them. Importing anything else from MyGST (`@/…`) fails the pack.
3. In **Admin → Plugins → Upload a plugin** (needs the *plugins.upload* admin permission), choose the file and click **Check file**. MyGST validates the manifest and shows the id, version, permissions and checksum. Confirm with **Upload plugin**.
4. Install it like any other plugin.

**How uploaded plugins are stored and run**
- The file is stored in the database (max 2 MB), so redeploys keep it. It's compiled once per server process and cached by its checksum.
- At load time it may `require` only `react`, `react/jsx-runtime`, `node:crypto` and the SDK. Everything else must be bundled.
- **Trust model:** the code runs inside MyGST with the server's full access. The manifest permissions limit what `ctx.data` allows, not what the code could do. Only upload plugins you wrote or reviewed, and compare the checksum. The upload, its checksum and the admin who did it are written to the audit log.
- **Updating:** upload a newer version of the same id. It replaces the code in place, keeping installs, settings and data. An older version is refused unless *allow downgrade* is ticked. If the new version asks for more permissions, owners are asked to accept them again.
- **Removing:** uninstalling an uploaded plugin deletes its code, settings and data.
- An id already used by a built-in or external plugin can't be uploaded.

---

## Versioning, upgrades and uninstalling

**Versioning and upgrades**
- Use semver. Bump the **minor** version for new features and the **major** version for breaking changes to your settings or data.
- Code plugins update with the deploy, uploaded ones when a newer file is uploaded. External plugins update when the admin reloads the manifest.
- Don't rename setting keys. Add new ones and keep reading the old ones.

**Uninstalling and admin controls**
- On uninstall, every company gets `onDisable` (or `plugin.uninstalled`), then `onUninstall` runs.
- The admin chooses whether to keep or delete the plugin's settings and storage. External plugins are always removed completely.
- When the admin changes availability or blocks a company, the same `onEnable`/`onDisable` calls happen for the companies affected.

---

## Submission checklist

Before opening a pull request that adds `src/plugins/<id>`:

- [ ] `id` equals the folder name, `version` is set, and `description` says what it does in one sentence.
- [ ] Only the permissions it uses, and the README explains each one.
- [ ] No imports outside `@/lib/plugins/sdk`, your folder, and npm packages (`npm run lint` passes).
- [ ] Event handlers are idempotent; nothing slow runs in filters.
- [ ] Secrets only in `secret` settings; nothing sensitive in logs.
- [ ] Tests in `tests/unit/plugins/<id>.test.ts` cover the main hooks (`npx vitest run tests/unit/plugins`).
- [ ] `npm run build` passes.
- [ ] Tried in `npm run dev`: install, turn on for a company, use, turn off, uninstall.
