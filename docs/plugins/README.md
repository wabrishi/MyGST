# MyGST plugin developer guide

Plugins add features to MyGST without changing its core. A plugin can:
- react to invoices, purchases, payments and other events, including their line items
- check or enrich documents before they are saved, and add sections to the invoice PDF
- add pages, a sidebar section, dashboard widgets, report links and settings
- keep its own data in **data tables**, add its own **role permissions**, handle **forms** and run **scheduled jobs**

That's enough to build whole modules such as inventory, accounting or a CRM. The built-in **Lead Manager** (`src/plugins/lead-manager`) is a complete example of a big plugin.

**Who this is for:** developers who know TypeScript and a little React. You don't need to know MyGST's internals: plugins only talk to MyGST through the SDK described here.

**How to read it**
- New to MyGST plugins? Read [Part 1](#part-1--concepts), then follow the [step-by-step tutorial](#part-2--build-a-plugin-step-by-step). It builds a working stock tracker from an empty folder to an uploaded file.
- Need a quick answer? See [Recipes](#part-3--recipes), [Troubleshooting](#troubleshooting) or the [Reference](#part-4--reference).

**Contents**
- [Part 1 · Concepts](#part-1--concepts)
  - [Two kinds of plugin](#two-kinds-of-plugin) · [Who switches what](#who-switches-what) · [Anatomy of a code plugin](#anatomy-of-a-code-plugin) · [Choosing the building blocks](#choosing-the-building-blocks) · [Failure isolation](#failure-isolation)
- [Part 2 · Build a plugin, step by step](#part-2--build-a-plugin-step-by-step)
  - [0. Set up](#step-0--set-up) · [1. Plan](#step-1--plan-the-plugin) · [2. Scaffold](#step-2--scaffold) · [3. Manifest](#step-3--write-the-manifest) · [4. Data](#step-4--store-data) · [5. Events](#step-5--react-to-events) · [6. Pages](#step-6--build-the-pages) · [7. Forms](#step-7--handle-a-form) · [8. Wire it up](#step-8--register-everything-in-setup) · [9. Test](#step-9--write-tests) · [10. Try it](#step-10--try-it-in-the-app) · [11. Ship](#step-11--ship-it) · [12. Update](#step-12--release-updates)
- [Part 3 · Recipes](#part-3--recipes)
- [Part 4 · Reference](#part-4--reference)
  - [Manifest](#manifest-reference) · [Permissions](#permissions) · [Events](#events-actions) · [Filters](#filters) · [Pages, widgets, settings and routes](#pages-widgets-settings-and-routes) · [Data tables](#data-tables) · [Role permissions](#role-permissions) · [Forms and actions](#forms-and-actions) · [UI kit](#ui-kit) · [Scheduled jobs](#scheduled-jobs) · [Sidebar and menu order](#sidebar-and-menu-order) · [The `ctx` object](#the-ctx-object) · [Testing helpers](#testing-helpers) · [Security rules](#security-rules)
  - [External plugins](#external-plugins) · [Package, upload and download](#package-upload-and-download) · [Versioning, upgrades and uninstalling](#versioning-upgrades-and-uninstalling)
- [Troubleshooting](#troubleshooting)
- [Submission checklist](#submission-checklist)

---

# Part 1 · Concepts

## Two kinds of plugin

|                 | **Code plugin** | **External plugin** |
|-----------------|-----------------|---------------------|
| Lives in        | `src/plugins/<id>/` in this repo, or **uploaded** as a packed file | Your own server, any language |
| Installed by    | Deploying (or **Admin → Plugins → Upload a plugin**), then **Install** | **Admin → Plugins → Add an external plugin** (manifest URL), then Install |
| Can do          | Everything in this guide | Events, the `document.validate` hook, pages and widgets shown in a frame, the `/api/v1` API |
| Talks to MyGST  | In-process, through the SDK (`@/lib/plugins/sdk`) | Signed HTTP calls in both directions |
| Good for        | Features that change how MyGST works: modules, automations, reports | Integrations with other systems, and work by third parties |

**Pick a code plugin** unless the feature must run on another server or in another language. Most of this guide is about code plugins; external plugins have [their own section](#external-plugins).

A code plugin reaches MyGST in one of two ways:
- **Built-in:** merged into this repo and deployed.
- **Uploaded:** packed into one file and uploaded by an admin, with no deploy. Uploaded code is trusted code, like a WordPress plugin: it runs inside MyGST.

## Who switches what

1. **Super admin** (platform operator)
   - Installs the plugin and answers *"Enable by default for every company?"*
   - Sets **Available to**:
     - **All companies**: each company can still be *blocked* individually.
     - **Selected companies**: only companies the admin *allows*.
     - **Nobody**: a kill switch.
   - Can change all of this at any time on the plugin's admin page or on a company's admin page.
   - Sets the order of the sidebar, including plugin sections, in **Admin → Menu**.
2. **Company owner**
   - Sees available plugins in **Settings → Plugins** and turns each on or off.
   - Accepts its permissions when turning it on, and fills in its settings.
   - Puts the plugin's own permissions into custom roles in **Settings → Roles**.
   - Plugins that are "enabled by default" start switched on; the owner can still turn them off.

A plugin runs for a company only when it is installed, available to that company, switched on, and not paused. That rule lives in one function: `isPluginActive()` in `src/lib/plugins/access.ts`.

## Anatomy of a code plugin

A plugin is a folder whose `index.ts` (or `index.tsx` if it has pages) default-exports `definePlugin({ manifest, setup })`:

```
src/plugins/stock-tracker/
├── index.tsx      manifest + setup(): registers everything
├── model.ts       data table helpers and business rules
├── events.ts      event handlers
├── actions.ts     form handlers
├── pages.tsx      pages and widgets (React server components)
└── README.md      for admins: what it does, its settings, why it needs each permission
tests/unit/plugins/stock-tracker.test.ts
```

Only `index` is required; splitting the rest into files is a recommendation that keeps big plugins readable.

- **The manifest** declares *what* the plugin is and needs: id, version, permissions, events, settings, pages, data tables, role permissions, jobs. MyGST validates it, shows it to admins and owners, and enforces it.
- **`setup(api)`** registers *the code* behind it: `api.on` (events), `api.filter`, `api.page`, `api.widget`, `api.action`, `api.schedule`, `api.route`, `api.settingsPage`, `api.lifecycle`.

Every declared page, widget and job must have its code registered, and every registered event, filter or job must be declared. Mismatches fail with a clear message when the plugin loads.

**The one import rule:** from MyGST, a plugin may import only `@/lib/plugins/sdk`. That gives you types, `definePlugin`, `PluginError` and the [UI kit](#ui-kit). Your own files and npm packages are fine. A lint rule enforces this in `src/plugins/**`, and the packer refuses anything else.

## Choosing the building blocks

| I want to… | Use | See |
|---|---|---|
| Do something after an invoice, purchase, payment… is saved | `api.on("<event>", handler)` | [Events](#events-actions) |
| Stop a save with a message, or add data while saving | `document.validate`, `document.beforeSave` filters | [Filters](#filters) |
| Print extra lines on the invoice PDF | `pdf.sections` filter | [Filters](#filters) |
| Show a screen | `pages` + `api.page` | [Pages](#pages-widgets-settings-and-routes) |
| Show a number or list on the dashboard | `widgets` + `api.widget` | [Pages](#pages-widgets-settings-and-routes) |
| Let users change data from my screen | `api.action` + `<ActionForm>` | [Forms and actions](#forms-and-actions) |
| Keep records (stock moves, ledger entries, leads…) | `collections` + `ctx.db` | [Data tables](#data-tables) |
| Keep a few values (a token, a counter) | `ctx.storage` | [`ctx`](#the-ctx-object) |
| Let owners decide who may do what | `capabilities` + `ctx.can` / `permission` | [Role permissions](#role-permissions) |
| Let owners configure it | `settings` | [Manifest](#manifest-reference) |
| Do something every hour or every morning | `jobs` + `api.schedule` | [Scheduled jobs](#scheduled-jobs) |
| Email someone | `ctx.mail.send` (`mail:send`) | [`ctx`](#the-ctx-object) |
| Call another service | `ctx.http.fetch` | [`ctx`](#the-ctx-object) |
| Receive a webhook from another service | `api.route(..., { public: true })` | [Routes](#pages-widgets-settings-and-routes) |
| Show a value on a document or product page | custom fields (`setCustomField`) | [Filters](#filters), [`ctx`](#the-ctx-object) |

## Failure isolation

Every hook runs with a timeout and its own error handling:
- A plugin that throws never breaks an invoice save, a page or the PDF.
- Errors appear in the plugin's log: **Admin → Plugins → (plugin) → Activity log**, and on the owner's **Settings → Plugins** page.
- After 20 failures in a row, the plugin is **paused** for that company until the owner turns it back on.

---

# Part 2 · Build a plugin, step by step

We'll build **Stock tracker**, a small inventory plugin:
- stock goes **up** when a purchase invoice is saved and **down** when a sales invoice is issued; cancelling reverses it
- the product page shows **Stock on hand**
- a **Stock** page lists every product; an **Adjust stock** page corrects stock by hand
- only Owners and Accountants may adjust (Staff can only look), and owners can change that in Settings → Roles
- a **Low stock** dashboard widget, and a **morning email** to owners when something runs low

Every piece of code below is complete and was tested; copy it as it is.

## Step 0 · Set up

You need the MyGST repo running locally:

```bash
docker compose up -d        # MySQL on localhost:3307
cp .env.example .env        # set DATABASE_URL=mysql://root:root@localhost:3307/mygst
npm install
npm run db:migrate
npm run dev                 # http://localhost:3000
```

Then:
1. In `.env`, set `SUPER_ADMIN_EMAILS="you@example.com"` and restart `npm run dev`.
2. Sign up with that email. You can now open **/admin**.
3. Create a company (or sign up a second user who creates one) to try your plugin in. Add a couple of products.

Without `SMTP_HOST` in `.env`, emails are printed in the `npm run dev` console. That's how you'll see the morning email.

## Step 1 · Plan the plugin

Before writing code, answer these questions. Each answer becomes part of the manifest.

| Question | Stock tracker's answer | Manifest field |
|---|---|---|
| What starts the work? | Purchase saved/cancelled, invoice issued/edited/cancelled | `events` |
| What MyGST data does it read or change? | Products, purchase and sales line items, company members; it writes a field on products and sends email | `permissions` |
| What does it remember? | Stock movements, per product | `collections` |
| Which screens? | Stock, Adjust stock, a dashboard widget | `pages`, `widgets` |
| Who may do what? | Everyone may look; Owner and Accountant may adjust | `capabilities` |
| What can each company configure? | The low-stock level | `settings` |
| Anything on a timer? | A morning low-stock email | `jobs` |

Ask for the fewest permissions you can: owners see the list when they turn the plugin on.

## Step 2 · Scaffold

```bash
npm run plugin:new -- stock-tracker "Stock tracker"
```

This creates `src/plugins/stock-tracker/index.ts`, a `README.md`, and a working test at `tests/unit/plugins/stock-tracker.test.ts`. It also refreshes `src/plugins/registry.generated.ts`, the build's list of plugins; never edit that file.

Our plugin has pages (JSX), so **rename `index.ts` to `index.tsx`**. Then create the empty files `model.ts`, `events.ts`, `actions.ts` and `pages.tsx` next to it. The id `stock-tracker` must stay equal to the folder name.

## Step 3 · Write the manifest

Replace `index.tsx` with the manifest. We'll fill in `setup()` in [Step 8](#step-8--register-everything-in-setup).

```tsx
import { definePlugin } from "@/lib/plugins/sdk";

export default definePlugin({
  manifest: {
    id: "stock-tracker",
    name: "Stock tracker",
    version: "1.0.0",
    description: "Stock on hand from purchase and sales invoices, with manual adjustments and low-stock alerts.",
    author: "Your name",
    icon: "Boxes",
    permissions: ["company:read", "documents:read", "purchases:read", "products:read", "products:write", "mail:send"],
    events: ["purchase.saved", "purchase.cancelled", "invoice.issued", "invoice.cancelled", "document.updated"],
    settings: [{ key: "lowStockAt", label: "Warn when stock falls to", type: "number", default: 5 }],
    capabilities: [
      { key: "stock.view", label: "See stock", roles: ["OWNER", "ACCOUNTANT", "STAFF"] },
      { key: "stock.adjust", label: "Adjust stock by hand", roles: ["OWNER", "ACCOUNTANT"] },
    ],
    collections: [{ name: "moves", indexes: ["productId", "ref", "date"], numbers: ["qty"] }],
    pages: [
      { slug: "stock", title: "Stock", icon: "Boxes", permission: "stock.view" },
      { slug: "adjust", title: "Adjust stock", icon: "ClipboardList", permission: "stock.adjust" },
    ],
    widgets: [{ id: "low", title: "Low stock", permission: "stock.view" }],
    jobs: [{ id: "low-stock-email", every: "daily", title: "Low stock email" }],
  },
  setup(api) {
    // Step 8
  },
});
```

What each part does:
- **`permissions`**: each event needs its matching permission (`purchase.*` needs `purchases:read`, invoice events need `documents:read`). `products:write` lets us put "Stock on hand" on the product page. The full list is in [Permissions](#permissions).
- **`capabilities`**: our own role permissions. `roles` are the built-in roles that get each one by default; Owners always have all of them.
- **`collections`**: one data table, `moves`. We'll filter on `productId`, `ref` and `date`, so they are `indexes`; we'll add up `qty`, so it's a `number`. Other fields are stored but can't be filtered.
- **`pages`**: two pages means the plugin gets its own collapsible "Stock tracker" section in the sidebar. Each page needs a capability.

## Step 4 · Store data

`model.ts` holds the data table helpers. The idea: every change in stock is one **movement** record, and stock on hand is the sum of a product's movements.

```ts
import type { LineItem, PluginContext } from "@/lib/plugins/sdk";

/** One stock movement: + for stock in (purchases), − for stock out (sales), ± for adjustments. */
export interface Move {
  productId: string;
  qty: number;
  /** What caused it: "purchase:<id>", "invoice:<id>" or "adjust:<n>". */
  ref: string;
  date: string;
  note: string;
}

export const moves = (ctx: PluginContext) => ctx.db.collection<Move>("moves");

/** Stock on hand = the sum of all movements of the product. */
export const onHand = (ctx: PluginContext, productId: string) => moves(ctx).sum("qty", { productId });

/** Shows the current stock on the product page in MyGST. */
export async function showOnProduct(ctx: PluginContext, productIds: Iterable<string>) {
  for (const id of productIds) {
    await ctx.data.products.setCustomField(id, "onHand", { label: "Stock on hand", value: String(await onHand(ctx, id)) });
  }
}

/**
 * Replaces the movements of one document. Saving the same document again (an edit, or a repeated
 * event) gives the same result, so event handlers stay idempotent.
 */
export async function replaceMoves(ctx: PluginContext, ref: string, date: string, items: LineItem[], sign: 1 | -1) {
  const touched = new Set((await moves(ctx).find({ where: { ref }, limit: 500 })).map((m) => m.productId));
  await moves(ctx).deleteMany({ ref });
  for (const item of items) {
    if (!item.productId) continue; // free-text lines aren't stock
    await moves(ctx).insert({ productId: item.productId, qty: sign * item.qty, ref, date, note: item.description });
    touched.add(item.productId);
  }
  await showOnProduct(ctx, touched);
}

export const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
```

Things to notice:
- Everything is automatically scoped to the current company and to your plugin. You never pass a company id.
- `replaceMoves` deletes and re-creates a document's movements. That makes it safe to run twice, which matters because **events are delivered at least once**.
- Dates are stored as `YYYY-MM-DD` text, which sorts and filters correctly.

## Step 5 · React to events

`events.ts` turns MyGST events into movements. Document events carry their line items in `event.data.items`.

```ts
import type { LineItem, PluginContext, PluginEventEnvelope } from "@/lib/plugins/sdk";
import { replaceMoves } from "./model";

type DocEvent = { id: string; type?: string; date: string; items?: LineItem[] };

/** Purchase invoice saved (new or edited): stock in. */
export async function onPurchaseSaved(event: PluginEventEnvelope, ctx: PluginContext) {
  const d = event.data as DocEvent;
  await replaceMoves(ctx, `purchase:${d.id}`, d.date, d.items ?? [], 1);
}

/** Sales invoice issued or edited: stock out. */
export async function onInvoiceSaved(event: PluginEventEnvelope, ctx: PluginContext) {
  const d = event.data as DocEvent;
  if (event.type === "document.updated" && d.type !== "INVOICE") return; // quotations and notes don't move stock
  await replaceMoves(ctx, `invoice:${d.id}`, d.date, d.items ?? [], -1);
}

/** Cancelled: its movements go away. */
export async function onCancelled(event: PluginEventEnvelope, ctx: PluginContext) {
  const d = event.data as DocEvent;
  const ref = event.type === "purchase.cancelled" ? `purchase:${d.id}` : `invoice:${d.id}`;
  await replaceMoves(ctx, ref, "", [], 1);
}
```

How events behave:
- They run **after** the change is saved, in the background, with **30 seconds** each.
- If a handler throws, the delivery is retried after 1 min, 5 min, 30 min, 2 h and 12 h. Return normally when there's nothing to do.
- There's no signed-in user, so `ctx.user` is `null`.
- The fields of each event are listed in [Events](#events-actions).

## Step 6 · Build the pages

`pages.tsx` holds the pages and the widget. They are **async React server components**: they can `await` data directly. Build them from the [UI kit](#ui-kit) so they look like the rest of MyGST, in light and dark mode.

```tsx
import { ActionForm, Badge, Button, ButtonLink, Card, Empty, Field, Input, Section, Select, Table, Td, Th, type PageProps, type PluginContext } from "@/lib/plugins/sdk";
import { moves, onHand } from "./model";

export const threshold = (ctx: PluginContext) => Number(ctx.settings.lowStockAt ?? 5);

/** Every product with what's on hand. */
export async function stockList(ctx: PluginContext) {
  const products = await ctx.data.products.list({ limit: 200 });
  return Promise.all(products.map(async (p) => ({ ...p, onHand: await onHand(ctx, p.id) })));
}

export async function StockPage({ ctx }: PageProps) {
  const rows = await stockList(ctx);
  const low = threshold(ctx);
  return (
    <>
      {ctx.can("stock.adjust") && (
        <div className="mb-3 flex justify-end">
          <ButtonLink href={ctx.pageUrl("adjust")}>Adjust stock</ButtonLink>
        </div>
      )}
      <Card>
        {rows.length === 0 ? (
          <Empty title="No products yet">Add products, then record a purchase invoice.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th className="text-right">On hand</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <a href={ctx.companyUrl(`products/${p.id}`)} className="font-medium text-primary hover:underline">
                      {p.name}
                    </a>
                  </Td>
                  <Td className="tabular text-right">{p.onHand}</Td>
                  <Td>{p.onHand <= low && <Badge color={p.onHand <= 0 ? "red" : "amber"}>{p.onHand <= 0 ? "Out of stock" : "Low"}</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

export async function AdjustPage({ ctx }: PageProps) {
  const products = await ctx.data.products.list({ limit: 200 });
  const recent = await moves(ctx).find({ where: { ref: { startsWith: "adjust:" } }, limit: 10 });
  const names = new Map(products.map((p) => [p.id, p.name]));
  return (
    <>
      <Section title="Adjust stock" description="Positive numbers add stock, negative numbers remove it.">
        <ActionForm ctx={ctx} action="adjust" className="grid gap-3 px-5 pb-5 sm:grid-cols-[1fr_120px_1fr_auto] sm:items-end">
          <Field label="Product">
            <Select name="productId" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity">
            <Input name="qty" type="number" step="any" required />
          </Field>
          <Field label="Reason">
            <Input name="reason" maxLength={200} placeholder="Stock count, damaged…" />
          </Field>
          <Button>Save</Button>
        </ActionForm>
      </Section>
      <Section title="Recent adjustments">
        <Table>
          <tbody>
            {recent.map((m) => (
              <tr key={m.id}>
                <Td className="w-28 text-muted">{m.date}</Td>
                <Td>{names.get(m.productId) ?? "Deleted product"}</Td>
                <Td className="tabular text-right">{m.qty > 0 ? `+${m.qty}` : m.qty}</Td>
                <Td className="text-muted">{m.note}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </>
  );
}

export async function LowStockWidget({ ctx }: { ctx: PluginContext }) {
  const low = (await stockList(ctx)).filter((p) => p.onHand <= threshold(ctx));
  if (!low.length) return <p className="text-sm text-muted">All stock is above {threshold(ctx)}.</p>;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {low.slice(0, 6).map((p) => (
        <li key={p.id} className="flex justify-between gap-2">
          <span className="truncate">{p.name}</span>
          <span className="tabular font-medium">{p.onHand}</span>
        </li>
      ))}
    </ul>
  );
}
```

Things to notice:
- MyGST renders the page title and the plugin name above your content; you render only the body.
- `ctx.can("stock.adjust")` hides the button from people who can't adjust. The *page itself* is protected by its `permission` in the manifest, so you don't check it again there.
- Build links with `ctx.pageUrl(slug, ...path)` (your pages) and `ctx.companyUrl(path)` (MyGST pages). They include the company for you.
- `<ActionForm action="adjust">` posts to the form handler we write next. It's a plain HTML form: no client JavaScript needed.

## Step 7 · Handle a form

`actions.ts` handles the Adjust stock form. The handler gets the form's `FormData` and the user's `ctx`.

```ts
import { PluginError, type FormActionResult, type PluginContext } from "@/lib/plugins/sdk";
import { moves, showOnProduct, todayIST } from "./model";

/** The "Adjust stock" form: add or remove stock by hand. */
export async function adjustStock(form: FormData, ctx: PluginContext): Promise<FormActionResult> {
  const productId = String(form.get("productId") ?? "");
  const qty = Number(form.get("qty"));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200);
  if (!productId) throw new PluginError("Choose a product");
  if (!Number.isFinite(qty) || qty === 0) throw new PluginError("Enter a quantity, e.g. 5 or -2");
  const product = await ctx.data.products.get(productId);
  if (!product) throw new PluginError("Product not found");

  await moves(ctx).insert({ productId, qty, ref: `adjust:${Date.now()}`, date: todayIST(), note: reason || "Manual adjustment" });
  await showOnProduct(ctx, [productId]);
  return { message: `${product.name}: ${qty > 0 ? "+" : ""}${qty} ${product.unit}`, redirect: ctx.pageUrl("stock") };
}
```

- **Validate everything** from the form: it's user input.
- `throw new PluginError("…")` sends the user back with that message shown as an error.
- Return `{ message, redirect }` to show a success message, optionally on another page of the same company.
- Before your code runs, MyGST has already checked that the user is signed in, the plugin is active for their company, the form came from MyGST itself, and the user holds the action's `permission` (set in Step 8).

## Step 8 · Register everything in `setup()`

Back in `index.tsx`, import the pieces and register them. This is also where the daily job lives.

```tsx
import { definePlugin, type PluginContext } from "@/lib/plugins/sdk";
import { adjustStock } from "./actions";
import { onCancelled, onInvoiceSaved, onPurchaseSaved } from "./events";
import { AdjustPage, LowStockWidget, StockPage, stockList, threshold } from "./pages";

/** Daily: email the owners a list of products at or below the low-stock level. */
async function lowStockEmail(ctx: PluginContext) {
  const low = (await stockList(ctx)).filter((p) => p.onHand <= threshold(ctx));
  if (!low.length) return;
  const owners = (await ctx.data.members()).filter((m) => m.roles.includes("Owner"));
  const rows = low.map((p) => `<li>${p.name.replace(/[<>&]/g, "")}: ${p.onHand}</li>`).join("");
  await ctx.mail.send({ toUserIds: owners.map((o) => o.userId), subject: `${low.length} product(s) low on stock`, html: `<ul>${rows}</ul>` });
}

export default definePlugin({
  manifest: {
    // … unchanged from Step 3 …
  },
  setup(api) {
    api.on("purchase.saved", onPurchaseSaved);
    api.on("invoice.issued", onInvoiceSaved);
    api.on("document.updated", onInvoiceSaved);
    api.on("purchase.cancelled", onCancelled);
    api.on("invoice.cancelled", onCancelled);

    api.page("stock", StockPage);
    api.page("adjust", AdjustPage);
    api.widget("low", LowStockWidget);
    api.action("adjust", adjustStock, { permission: "stock.adjust" });
    api.schedule("low-stock-email", lowStockEmail);
  },
});
```

- The `permission` on `api.action` means even a hand-made POST can't adjust stock without the capability.
- Jobs run once per period **for each company** where the plugin is active. Daily jobs run once a day from 06:00 IST. Like events, they have no user.
- When building HTML for an email, escape values that came from users (here, product names).

## Step 9 · Write tests

Plugins are tested without a database or a server. `loadForTest` validates the manifest exactly as MyGST will, and `createPluginTestContext` gives you an in-memory `ctx`: data tables, storage, mail and logs, with `ctx.data` methods you stub as needed.

Replace `tests/unit/plugins/stock-tracker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createPluginTestContext, loadForTest } from "@/lib/plugins/testing";
import plugin from "@/plugins/stock-tracker";

const p = loadForTest(plugin);
const rod = { productId: "rod", description: "Steel rod", hsnSac: "7214", qty: 10, unit: "NOS", rate: 200, gstRate: 18, taxable: 2000 };
const products = {
  list: async () => [{ id: "rod", name: "Steel rod", hsnSac: "7214", salePrice: 300, gstRate: 18 }],
  get: async (id: string) => (id === "rod" ? { id, name: "Steel rod", hsnSac: "7214", isService: false, unit: "NOS", salePrice: 300, purchasePrice: 200, gstRate: 18, active: true, customFields: {} } : null),
};

function setup(capabilities?: string[]) {
  const fields: Record<string, unknown> = {};
  const ctx = createPluginTestContext({
    manifest: p.manifest,
    user: { id: "u1", name: "Asha", email: "asha@test.local" },
    capabilities,
    data: { products: { ...products, setCustomField: async (id, key, field) => void (fields[`${id}.${key}`] = field) } },
  });
  return { ctx, fields };
}

describe("stock-tracker", () => {
  it("purchases add stock, sales remove it, cancelling reverses", async () => {
    const { ctx, fields } = setup();
    await p.emit("purchase.saved", { id: "b1", date: "2026-11-01", items: [rod] }, ctx);
    await p.emit("invoice.issued", { id: "i1", date: "2026-11-02", items: [{ ...rod, qty: 4 }] }, ctx);
    expect(fields["rod.onHand"]).toEqual({ label: "Stock on hand", value: "6" });

    // Events can arrive twice: the result is the same.
    await p.emit("invoice.issued", { id: "i1", date: "2026-11-02", items: [{ ...rod, qty: 4 }] }, ctx);
    expect(await ctx.db.collection("moves").sum("qty", { productId: "rod" })).toBe(6);

    await p.emit("invoice.cancelled", { id: "i1" }, ctx);
    expect(fields["rod.onHand"]).toEqual({ label: "Stock on hand", value: "10" });
  });

  it("manual adjustments need the stock.adjust permission", async () => {
    const staff = setup(["stock.view"]);
    expect(await p.runAction("adjust", { productId: "rod", qty: "5" }, staff.ctx)).toEqual({ error: "You don't have permission to do that" });

    const { ctx } = setup();
    expect(await p.runAction("adjust", { productId: "rod", qty: "0" }, ctx)).toEqual({ error: "Enter a quantity, e.g. 5 or -2" });
    expect((await p.runAction("adjust", { productId: "rod", qty: "-2", reason: "Damaged" }, ctx)).message).toBe("Steel rod: -2 NOS");
  });

  it("emails the owners about low stock", async () => {
    const ctx = createPluginTestContext({
      manifest: p.manifest,
      settings: { lowStockAt: 5 },
      data: { products, members: async () => [{ userId: "o1", name: "Owner", email: "o@test.local", roles: ["Owner"] }] },
    });
    await p.runJob("low-stock-email", ctx); // nothing in stock yet: 0 is at or below 5
    expect(ctx.mails[0]).toMatchObject({ toUserIds: ["o1"], subject: "1 product(s) low on stock" });
  });
});
```

Run the tests, type-check and lint:

```bash
npx vitest run tests/unit/plugins/stock-tracker.test.ts
npm run typecheck
npm run lint
```

On Windows, run Vitest from PowerShell or cmd, not Git Bash. All helpers are listed in [Testing helpers](#testing-helpers).

## Step 10 · Try it in the app

1. **Restart `npm run dev`** so the new folder is picked up.
2. **Install it.** Open **Admin → Plugins**. *Stock tracker* is listed as *Not installed*. If instead a yellow box says it *failed to load*, read the message: it names the problem in your manifest or `setup()`. Click **Install**, check the permissions, choose *On by default* and *All companies*.
3. **Use it as an owner.** In your company, the sidebar now has a **Stock tracker** section with *Stock* and *Adjust stock*, and the dashboard shows *Low stock*. Check **Settings → Plugins → Stock tracker**: the *Warn when stock falls to* setting is there.
4. **Make stock move.**
   - Record a purchase invoice for a product: the product page shows *Stock on hand*.
   - Issue a sales invoice: it goes down. Cancel it: it goes back up.
   - Events are delivered right after the request; if a number looks stale, refresh once.
5. **Check permissions.** Invite a second user with the **Staff** role: they see the *Stock* page, but not *Adjust stock* or its button, because Staff only gets `stock.view` by default. In **Settings → Roles**, a *Stock tracker* group lists *See stock* and *Adjust stock by hand*, ready to put into custom roles.
6. **Run the job.** The morning email runs from the cron tick. Locally, set `CRON_SECRET` to any value in `.env` (restart `npm run dev`), call the tick yourself, and watch the `npm run dev` console for the printed email:
   ```bash
   curl -H "Authorization: Bearer <CRON_SECRET from .env>" http://localhost:3000/api/cron/tick
   ```
   A daily job runs once per day per company, and only from 06:00 IST.
7. **Look at the log.** Errors from your code appear in **Admin → Plugins → Stock tracker → Activity log**. Use `ctx.log.info("…")` to write your own entries while developing.

## Step 11 · Ship it

You have two ways to get the plugin onto the live server.

**A. As a built-in plugin.** Commit `src/plugins/stock-tracker` and its test, and deploy. The build includes it, and the super admin installs it from Admin → Plugins.

**B. As an uploaded plugin**, with no deploy:
1. Pack it:
   ```bash
   npm run plugin:pack -- stock-tracker
   ```
   This writes `dist-plugins/stock-tracker-1.0.0.mygst-plugin.js` and prints its SHA-256. Keep the checksum with the file.
2. On the live server, a super admin opens **Admin → Plugins → Upload a plugin**, chooses the file and clicks **Check file**. MyGST shows the id, version, permissions and checksum; compare the checksum, then **Upload plugin**.
3. Install it as in Step 10.

Uploaded plugins are trusted code with the server's full access: only upload code you wrote or reviewed. Details are in [Package, upload and download](#package-upload-and-download).

## Step 12 · Release updates

1. Change the code and bump `version`: `1.0.1` for fixes, `1.1.0` for new features, `2.0.0` when settings or stored data change in a way old versions can't read.
2. Run the tests again.
3. Deploy (built-in) or pack and upload the new file (uploaded). Upload replaces the code in place and keeps installs, settings and data.
4. If the new version asks for **more permissions**, each owner is asked to accept them again before it runs for them.

Rules that keep upgrades safe:
- Never change the plugin `id`, a setting `key`, a collection `name` or a capability `key` after release. Add new ones instead.
- Plan your data table `indexes` before the first release: adding an index field later only indexes records saved after that.
- Make handlers cope with records written by older versions (for example, a field that's missing).

---

# Part 3 · Recipes

Short, copyable patterns. Each needs the permissions and manifest entries noted.

**Notify another service when an invoice is issued** (`documents:read`, event `invoice.issued`, a `secret` setting `apiKey`):

```ts
api.on("invoice.issued", async (event, ctx) => {
  if (await ctx.storage.get(`sent:${event.id}`)) return;              // at-least-once delivery
  const res = await ctx.http.fetch("https://api.example.com/invoices", {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.settings.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ number: event.data.number, total: event.data.total }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);                  // thrown = retried later
  await ctx.storage.set(`sent:${event.id}`, true);
});
```

**Block an invoice unless a rule is met** (filter `document.validate`):

```ts
import { PluginError } from "@/lib/plugins/sdk";

api.filter("document.validate", (_value, { type, input, party }) => {
  if (type === "INVOICE" && party.gstin && !input.notes?.includes("PO:")) {
    throw new PluginError(`Add ${party.name}'s PO number in Notes, like "PO: 12345".`);
  }
});
```

**Print a line on the invoice PDF** (filter `pdf.sections`):

```ts
api.filter("pdf.sections", (sections, { document }, ctx) =>
  document.type === "INVOICE" ? [...sections, { title: "Bank note", lines: [String(ctx.settings.note)] }] : sections,
);
```

**Save a value on a document and print it** (filter `document.beforeSave`):

```ts
api.filter("document.beforeSave", (value) => ({
  ...value,
  customFields: { ...value.customFields, "my-plugin.ref": { label: "Ref", value: "X1", onPdf: true } },
}));
```

**Add a link to the Reports page** (filter `reports.list`):

```ts
api.filter("reports.list", (links) => [...links, { label: "Stock valuation", href: "apps/stock-tracker/stock", description: "Value of stock on hand" }]);
```

**Receive a webhook from another service** (a public route with a shared secret setting):

```ts
api.route("POST", "hook/*", async (request, { path, contextFor }) => {
  const [companyId] = path;
  const ctx = await contextFor(companyId);                      // null unless the plugin is active there
  if (!ctx || request.headers.get("x-secret") !== ctx.settings.webhookSecret) return new Response("Forbidden", { status: 403 });
  await ctx.db.collection("inbox").insert(await request.json());
  return Response.json({ ok: true });
}, { public: true });
// URL to give the other service: https://<your-mygst>/api/plugins/<id>/hook/<companyId>
```

**A one-click button on a list** (UI kit `ActionButton`; the handler reads `form.get("id")`):

```tsx
<ActionButton ctx={ctx} action="markDone" values={{ id: row.id }}>Done</ActionButton>
```

**A delete that needs a second click** (UI kit `ConfirmAction`):

```tsx
<ConfirmAction ctx={ctx} action="deleteRow" values={{ id: row.id }} label="Delete" confirmLabel="Delete row" />
```

**Paging a list** (UI kit `Pager`, page number in the URL):

```tsx
const page = Math.max(1, Number(searchParams.page) || 1);
const rows = await ctx.db.collection("moves").find({ limit: 26, offset: (page - 1) * 25 });
// … render rows.slice(0, 25) …
<Pager page={page} hasMore={rows.length > 25} href={(n) => `${ctx.pageUrl("moves")}?page=${n}`} />
```

**A detail page under a list page** (no extra manifest entry): `/apps/<id>/leads/<leadId>` reaches the `leads` page with `path = [leadId]`.

```tsx
api.page("leads", async ({ ctx, path }) => (path[0] ? <LeadDetail id={path[0]} ctx={ctx} /> : <LeadList ctx={ctx} />));
```

---

# Part 4 · Reference

## Manifest reference

| Field | Type | Notes |
|---|---|---|
| `id` | string | **Required.** 3–42 characters: lowercase letters, digits and `-`, starting with a letter. Must equal the folder name. Never change it after release. |
| `name` | string | **Required.** 2–60 characters. |
| `version` | semver | **Required.** For example `1.2.0`. |
| `description`, `author`, `homepage` | string | Shown to admins and owners. |
| `icon` | string | A [lucide](https://lucide.dev/icons) name for menus. Supported: `Puzzle`, `Bell`, `Blocks`, `Boxes`, `Calculator`, `Calendar`, `ClipboardList`, `Cloud`, `Mail`, `MessageSquare`, `QrCode`, `Send`, `Truck`, `Wallet`, `BarChart3`, `FileText`, `Package`, `ReceiptIndianRupee`, `ScrollText`, `ShoppingCart`, `Users`, `Settings`, `LayoutDashboard`. Anything else shows `Puzzle`. |
| `minAppVersion` | semver | Install is refused on older MyGST versions. |
| `permissions` | string[] | See [Permissions](#permissions). Ask only for what you use. |
| `events` | string[] | [Events](#events-actions) to receive. Each needs its matching permission. |
| `filters` | string[] | [Filters](#filters) the plugin implements. |
| `settings` | field[] | `{ key, label, type, help?, required?, default?, options? }`. `type` is `text`, `textarea`, `number`, `boolean`, `select` (needs `options: [{ value, label }]`), `secret` or `url`. MyGST renders the form in Settings → Plugins. `secret` values are encrypted at rest and never shown again. |
| `pages` | page[] | Up to 20. `{ slug, title, icon?, roles?, inNav?, permission? }`. The URL is `/c/<company>/apps/<id>/<slug>`. `roles` defaults to all three (`OWNER`, `ACCOUNTANT`, `STAFF`). `inNav` (default true) adds it to the sidebar. `permission` is one of your `capabilities`. |
| `widgets` | widget[] | `{ id, title, roles?, width?, permission? }` on the dashboard. `width` is `third` (default), `half` or `full`. |
| `collections` | table[] | Up to 10 [data tables](#data-tables): `{ name, indexes?: string[] (max 4), numbers?: string[] (max 2) }`. Code plugins only. |
| `capabilities` | permission[] | Up to 30 [role permissions](#role-permissions): `{ key, label, roles? }`. Keys look like `stock.adjust` or `leads.viewAll`. |
| `jobs` | job[] | Up to 10 [scheduled jobs](#scheduled-jobs): `{ id, every: "hourly" \| "daily", title? }`. Code plugins only. |
| `webhookUrl`, `pageBaseUrl`, `validateUrl` | https URL | **External plugins only.** See [External plugins](#external-plugins). |

## Permissions

| Permission | Grants |
|---|---|
| `company:read` | `ctx.data.company()`, `ctx.data.members()`; `company.updated` events |
| `documents:read` | `ctx.data.documents.list/get`; invoice, quotation and note events, `document.updated`; `GET /api/v1/documents` |
| `documents:write` | `ctx.data.documents.setCustomField/createQuotation`; `POST /api/v1/quotations` |
| `parties:read` | `ctx.data.parties.list/get`; `party.saved` |
| `parties:write` | `ctx.data.parties.upsert`; `POST /api/v1/parties/upsert` |
| `products:read` | `ctx.data.products.list/get`; `product.saved` |
| `products:write` | `ctx.data.products.setCustomField` (shown on the product page) |
| `payments:read` | `ctx.data.payments.receivables/list`; `payment.received`, `payment.paid` |
| `purchases:read` | `ctx.data.purchases.list/get`; `purchase.saved`, `purchase.cancelled` |
| `purchaseOrders:read` | `ctx.data.purchaseOrders.list/get`; `purchase_order.saved`, `purchase_order.cancelled` |
| `mail:send` | `ctx.mail.send`: email company members or a customer/supplier (100 a day per company) |
| `reports:read` | Reserved for report data (not yet exposed) |

Calling a method without its permission throws an error that names the missing permission.

## Events (actions)

Events run **after** the change is saved:
- They go through a transactional outbox, so an event exists only if the change committed.
- They are delivered right after the request, and retried by the `/api/cron/tick` job after 1 min, 5 min, 30 min, 2 h and 12 h before giving up.
- Each handler has **30 seconds**. Handlers for one plugin run in `priority` order (lower first, default 10).
- **Delivery is at least once:** make handlers idempotent, for example by deduping on `event.id` or by replacing rather than adding (as in Step 4).

```ts
api.on("invoice.issued", async (event, ctx) => { … }, { priority: 5 });
```

`event` is `{ id, type, occurredAt, companyId, data }`:

| Event | `data` (amounts in rupees) |
|---|---|
| `invoice.issued` | `id, number, total, amount, status, url, date, partyId, partyName, items[], leadRef?` |
| `invoice.cancelled` | `id, number, total, status: "CANCELLED", url, partyId, leadRef?` |
| `document.updated` | `id, type, number, status, total, url, date, partyId, partyName, items[]`: an invoice, quotation or note was edited |
| `quotation.created` | `id, number, total, status: "OPEN", url, date, partyId, partyName, items[], leadRef?` |
| `quotation.converted` | `id, number, total, url, partyId, invoiceId, invoiceNumber, invoiceUrl` |
| `credit_note.issued`, `debit_note.issued` | `id, number, total, url, date, partyId, partyName, items[], originalInvoiceId, reason` |
| `payment.received` | `id, number (reference), amount, url, partyId, invoiceIds[], date, leadRef?` |
| `payment.paid` | `id, number (reference), amount, url, partyId, billIds[], date` |
| `purchase.saved` | `id, number (supplier invoice no.), total, status: CREATED or UPDATED, url, partyId, partyName, date, itcType, purchaseOrderId, items[]` |
| `purchase.cancelled` | `id, number, total, status: "CANCELLED", url, partyId, partyName, date, purchaseOrderId, items[]` |
| `purchase_order.saved` | `id, number, total, status: CREATED or UPDATED, url, partyId, partyName, date, expectedDate, items[]` |
| `purchase_order.cancelled` | `id, number, total, status: "CANCELLED", url, partyId, partyName` |
| `party.saved` | `id, status, name, type, gstin, phone, email, stateCode, url` |
| `product.saved` | `id, status, name, hsnSac, salePrice, gstRate, url` |
| `company.updated` | `id, name, gstin, stateCode` |

`items[]` are the document's lines: `{ productId, description, hsnSac, qty, unit, rate, gstRate, taxable }` (the `LineItem` type; rupees; `productId` is null for free-text lines).

Throwing from a handler marks the delivery failed, and it is retried. Return normally when there's nothing to do.

**Lifecycle hooks**

```ts
api.lifecycle({
  onInstall: async () => {},        // super admin installed it (once, platform-wide)
  onUninstall: async () => {},
  onEnable: async (ctx) => {},      // it became active for a company
  onDisable: async (ctx) => {},     // it stopped being active there (owner, admin, kill switch, uninstall)
});
```

## Filters

Filters run **inside the request**:
- Each one receives a value and returns it, possibly changed.
- Each has **2 seconds**: no slow work and no outside calls here.
- A failing filter is skipped (fail-open). The one exception is a `PluginError` thrown from `document.validate`, which stops the save.

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
| `nav.items` | `LinkItem[]` | `{}` | Extra sidebar links (under **Apps**), in addition to `pages`. |

`href` can be a path inside the company, such as `apps/my-plugin/report?x=1`, or an absolute `https://` URL, which opens in a new tab.

**Custom fields.** `document.beforeSave` may add, change or remove fields **under its own prefix** (`"<plugin-id>.<key>"`); other keys are ignored. Each field is `{ label, value, onPdf? }`. Fields show on the document page, and those with `onPdf: true` also print on the PDF. Event handlers can set them later with `ctx.data.documents.setCustomField(id, key, field)`. Products have the same idea through `ctx.data.products.setCustomField` (shown on the product page).

## Pages, widgets, settings and routes

Pages and widgets are **async React server components**. They render on the server, can `await ctx.data…` and `ctx.db…`, and should use the [UI kit](#ui-kit).

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
- A page is shown at `/c/<company>/apps/<plugin>/<slug>/<…path>` inside the normal app layout, with its title above your content.
- MyGST checks membership, the page's `roles` and its `permission` before rendering; users without them are sent back to the dashboard.
- If a page or widget throws, users see a short notice and the error is logged.
- To change data, use [form actions](#forms-and-actions); they also work in uploaded plugins. Built-in plugins may also render a `"use client"` component from their folder (uploaded plugins can't).

**HTTP routes** are for webhooks from other services, file downloads, or client components to call:

```ts
api.route("POST", "sms-status", async (request, { ctx, path, contextFor }) => Response.json({ ok: true }), { public: true });
api.route("GET", "export/*", async (request, { ctx, path }) => new Response("…"), { roles: ["OWNER", "ACCOUNTANT"], permission: "stock.view" });
```

- The URL is `/api/plugins/<id>/<path>`. A path ending in `/*` matches anything below it, and the rest arrives in `path`. Paths starting with `_` are reserved.
- **Signed-in routes** (the default) need `?companyId=<id>`. MyGST checks that the caller is a member there with one of `roles` (and the `permission` capability, if set), and that the plugin is active. `ctx` is then that user's context.
- **Public routes** (`{ public: true }`) get `ctx: null`. Authenticate the caller yourself, for example with a shared secret in your settings. Then use `await contextFor(companyId)`, which returns `null` unless your plugin is active for that company.

## Data tables

Declare tables in the manifest, then use `ctx.db.collection(name)`. Records are JSON objects (max 64 KB), stored per plugin **and** per company. Fields listed in `indexes` (text, max 191 characters) and `numbers` are indexed, so you can filter, sort and sum on them. Everything else is stored but not queryable.

```ts
// manifest
collections: [{ name: "stock_moves", indexes: ["productId", "date", "kind"], numbers: ["qty", "value"] }],

// code
const moves = ctx.db.collection<{ productId: string; date: string; kind: "in" | "out"; qty: number; value: number; ref: string }>("stock_moves");
await moves.insert({ productId, date: "2026-11-18", kind: "in", qty: 10, value: 2500, ref: "PUR/12" });
const onHand = (await moves.sum("qty", { productId, kind: "in" })) - (await moves.sum("qty", { productId, kind: "out" }));
const recent = await moves.find({ where: { productId, date: { gte: "2026-04-01" } }, orderBy: "-date", limit: 50, offset: 0 });
await moves.update(recent[0].id, { value: 2600 });   // merge
await moves.deleteMany({ ref: "PUR/12" });            // a filter is required
```

| Method | Notes |
|---|---|
| `insert(data)`, `get(id)`, `update(id, patch)`, `replace(id, data)`, `delete(id)` | Records come back with `id`, `createdAt`, `updatedAt`, `createdById`. `update` merges. |
| `find({ where?, orderBy?, limit? (≤ 500), offset? })`, `findOne(where)` | Default order: newest first. `orderBy`: `"field"`, `"-field"` or a list. |
| `count(where?)`, `sum(numberField, where?)`, `deleteMany(where)` | `sum` only on `numbers` fields. |

A `where` matches on index or number fields (and `id`, `createdAt`): `{ stage: "Won" }`, `{ value: { gte: 1000 } }`, `{ id: { in: [...] } }`, `{ name: { contains: "acme" } }`. Operators: `eq`, `ne`, `in`, `gt`, `gte`, `lt`, `lte`, `startsWith`, `contains` (text matches ignore case). An `undefined` value is ignored, so `{ ownerId: onlyMine ? me : undefined }` works. Using a field that isn't declared throws a clear error.

Limits and tips:
- 200,000 records per plugin per company.
- Index values are compared as **text**: store dates as `YYYY-MM-DD` and put numbers you compare in `numbers`.
- Adding a field to `indexes` later only indexes records saved after that, so plan indexes before the first release.
- To search across several fields, keep one lower-cased "search" text field and index it (as Lead Manager does).
- Uninstalling with "delete data" removes the records.

For a few values that aren't records (a token, a "last synced" date), use `ctx.storage` instead.

## Role permissions

Your plugin can add its own permissions to MyGST's roles:

```ts
capabilities: [
  { key: "stock.view", label: "See stock", roles: ["OWNER", "ACCOUNTANT", "STAFF"] },
  { key: "stock.adjust", label: "Adjust stock", roles: ["ACCOUNTANT"] },
],
pages: [{ slug: "adjust", title: "Adjust stock", permission: "stock.adjust" }],
```

- `roles` are the built-in roles that hold the permission by default. **Owners always hold every one.**
- In **Settings → Roles**, owners see a group named after your plugin and can put these permissions in custom roles (stored as `plugin:<id>:<key>`). People can only grant permissions they hold themselves.
- Opening a plugin page also needs one of the page's `roles`. A member whose only roles are custom ones needs the **Use <plugin>** permission (under *Apps* in Settings → Roles) as well as the capability.
- MyGST checks `permission` on pages, widgets, routes and actions before your code runs. Inside your code use `ctx.can("stock.adjust")`, for example to hide a button or to limit what a list shows (Lead Manager shows Staff only their own leads unless they hold `leads.viewAll`).
- In events and jobs there's no user, so `ctx.can()` returns `true`: the plugin itself is acting.

## Forms and actions

Pages render on the server, so changes go through **form actions**: plain HTML forms that work without client JavaScript and inside uploaded plugins.

```tsx
import { ActionForm, Button, Field, Hidden, Input, PluginError } from "@/lib/plugins/sdk";

api.action("adjust", async (form, ctx) => {
  const qty = Number(form.get("qty"));
  if (!qty) throw new PluginError("Enter a quantity");                  // shown as an error on the page
  // … change data …
  return { message: "Stock adjusted", redirect: ctx.pageUrl("stock") }; // both optional
}, { permission: "stock.adjust" });

api.page("adjust", async ({ ctx }) => (
  <ActionForm ctx={ctx} action="adjust">
    <Hidden name="productId" value="…" />
    <Field label="Quantity"><Input name="qty" type="number" /></Field>
    <Button>Save</Button>
  </ActionForm>
));
```

- The form posts to `/api/plugins/<id>/_action/<name>?companyId=…`. MyGST checks the user is a signed-in member, the plugin is active, the form came from MyGST itself (cross-site posts are refused), and the action's `permission`.
- After the handler, the browser returns to the page (or `redirect`, which must be a path in the same company) with `message` shown at the top. A `PluginError` shows its text as an error. Any other error is logged, and the user sees a generic message.
- `<ActionForm returnTo="…">` sets where to go back to; by default it's the page the form is on.
- Handlers have 30 seconds. Action names are letters, digits, `_` and `-`.

## UI kit

Import MyGST's own components from the SDK so your screens match the app in light and dark mode:

| Component | Use |
|---|---|
| `Card`, `CardHeader`, `Section` (card with a heading row), `Grid` (row of tiles) | Layout |
| `Stat` | A number tile (`label`, `value`, `hint?`, `href?`) |
| `Table`, `Th`, `Td` | Tables (wrap rows in `<thead>`/`<tbody>`) |
| `Badge` | Status label: `color` is `gray`, `blue`, `green`, `amber` or `red` |
| `Button`, `ButtonLink` | `variant`: `primary`, `secondary`, `ghost`, `danger`, `soft`; `size`: `sm`, `md`, `lg` |
| `Field`, `Input`, `Select`, `Textarea`, `Hidden` | Form fields (`Field` adds the label) |
| `ActionForm`, `ActionButton`, `ConfirmAction` | Forms that run your `api.action` handlers |
| `Alert` | Message box: `kind` is `error`, `success`, `info` or `warning` |
| `Empty` | Empty state with a title and text |
| `FilterPills`, `Toolbar`, `Pager`, `Avatar` | Filters, a toolbar row, previous/next paging, initials avatar |

You can also use the app's Tailwind classes (`text-muted`, `bg-surface`, `border-border`, `text-primary`, `tabular` for numbers…).

URL helpers: `ctx.pageUrl("leads", id)` → `/c/<company>/apps/<plugin>/leads/<id>`, `ctx.companyUrl("quotations/new")` → `/c/<company>/quotations/new`.

## Scheduled jobs

```ts
jobs: [{ id: "reorder-alert", every: "daily", title: "Low stock email" }],
// …
api.schedule("reorder-alert", async (ctx) => { … });
```

- The cron tick (`/api/cron/tick`, called every minute by the server's cron job) runs each due job once **per company** where the plugin is active.
- Hourly jobs run once per clock hour; daily jobs run once a day from 06:00 IST.
- A run is claimed before it starts, so it never runs twice for the same period. Each run has 30 seconds. Errors are logged and count towards auto-pause, like events.
- `ctx.user` is `null`. Use `ctx.mail.send({ toUserIds, subject, html })` (permission `mail:send`) to tell people.
- Work in small batches: a job that has to process thousands of records should do a slice per run and remember its place in `ctx.storage`.

## Sidebar and menu order

- A plugin with **one** sidebar page appears under **Apps**. A plugin with **several** gets its own section, titled with the plugin's name.
- Users can expand and collapse every section; their choice is remembered in their browser.
- The super admin sets the order of sections, and of the items in them, in **Admin → Menu**. Your plugin's section can be placed anywhere, for example above Sales. A newly installed plugin appears at the end until it's placed.
- Pages the user can't open (roles or `permission`) are hidden. Use `inNav: false` for pages reached only by links.

## The `ctx` object

| Member | Description |
|---|---|
| `pluginId`, `companyId`, `company` | The company the code runs for (`id, legalName, tradeName, gstin, stateCode`). |
| `user`, `role` | The signed-in user for pages, widgets, routes, actions and filters. `null` in events and jobs (background work runs as the owner who enabled the plugin). |
| `can(capability)` | Does the user hold one of your [role permissions](#role-permissions)? Always `true` in the background. |
| `settings` | This company's settings for your plugin, with secrets decrypted and defaults applied. |
| `storage.get/set/delete/list(prefix)` | Key-value storage per plugin **and** company. Keys are 1–191 characters of `[A-Za-z0-9._:/-]`; values at most 64 KB. |
| `db.collection(name)` | Your [data tables](#data-tables). |
| `mail.send({ toUserIds?, toPartyId?, subject, html })` | Email company members or one customer/supplier (`mail:send`, 100 a day per company). |
| `data.company()`, `data.members()` | Company profile; the company's people `{ userId, name, email, roles }` (`company:read`). |
| `data.documents.list({ type?, from?, to?, partyId?, limit? })`, `.get(id)` | Sales documents. `get` returns the full document with items (money in **paise**). |
| `data.documents.setCustomField(id, key, field \| null)` | Set or remove your custom field (`documents:write`). |
| `data.documents.createQuotation(body)` | Same body as `POST /api/v1/quotations` (`documents:write`). |
| `data.parties.list({ search?, limit? })`, `.get(id)`, `.upsert(body)` | Customers and suppliers. `upsert` takes the same body as `POST /api/v1/parties/upsert`. |
| `data.products.list({ search?, limit? })`, `.get(id)`, `.setCustomField(id, key, { label, value } \| null)` | Products. Custom fields (`products:write`) show on the product page. |
| `data.payments.receivables(partyId?)`, `.list({ from?, to?, partyId?, limit? })` | Outstanding invoices; payments in and out. |
| `data.purchases.list(…)`, `.get(id)` | Purchase invoices; `get` includes `items`. |
| `data.purchaseOrders.list({ status?, from?, to?, limit? })`, `.get(id)` | Purchase orders; `get` includes items with `billedQty` and `remaining`. |
| `http.fetch(url, init)` | `fetch` with a 10 s timeout. It doesn't follow redirects, and in production it refuses private and loopback addresses. |
| `log.info/warn/error(message)` | Written to the plugin's Activity log that admins see. Keep it short; never log secrets. |
| `appUrl(path)` | An absolute MyGST URL, for links in emails. |
| `pageUrl(slug?, ...path)`, `companyUrl(path)`, `actionUrl(name)` | Paths to your pages, to MyGST pages in this company, and to a form action. |

List methods return at most 200 rows (`limit`). Plugins never get a database client: everything is scoped to `ctx.companyId`.

## Testing helpers

`@/lib/plugins/testing` runs plugins with no database or server:

| Helper | What it does |
|---|---|
| `loadForTest(plugin)` | Validates the manifest and collects the hooks, exactly like MyGST. Returns the plugin with the methods below. |
| `p.emit(event, data, ctx, id?)` | Runs your event handlers. Pass the same `id` twice to test idempotency. |
| `p.applyFilter(name, value, args, ctx)` | Runs your filters and returns the result. |
| `p.runAction(name, values, ctx)` | Runs a form action like a post: returns `{ message, redirect }`, or `{ error }` for a `PluginError` or a missing permission. |
| `p.runJob(id, ctx)` | Runs a scheduled job. |
| `createPluginTestContext({ manifest, settings?, data?, fetch?, user?, role?, capabilities? })` | An in-memory `ctx`. |

The test context gives you:
- `ctx.db`: in-memory data tables with the same field rules as the real ones; `ctx.records` holds the rows.
- `ctx.logs`, `ctx.store` (storage), `ctx.requests` (HTTP calls) and `ctx.mails` to inspect.
- `user` + `capabilities: [...]` to test as a signed-in user who holds only some permissions. Without `user`, it acts like the background (events and jobs).
- `data`: stub only the `ctx.data` methods you use; unstubbed ones throw a clear error.

Run plugin tests with `npx vitest run tests/unit/plugins`. Examples: `tests/unit/lead-manager.test.ts`, `tests/unit/plugins.test.ts`.

## Security rules

**Must**
1. Import only `@/lib/plugins/sdk` from MyGST, plus your own files and npm packages. No `@/lib/db`, no Prisma, no imports from other plugins or from `src/app`.
2. Never take a company id from user input or a request body. Use `ctx.companyId`. In public routes, map the caller to a company only after authenticating it.
3. Declare only the permissions you use. Owners see them, and an upgrade that adds permissions must be accepted again.
4. Protect every page, widget, route and action that changes or shows sensitive data with a `permission` (or `roles`), and check `ctx.can` where one screen serves several levels of access.
5. Validate all form and route input. Treat it as untrusted.
6. Keep secrets in `secret` settings, never in code, logs, custom fields or values you display.
7. Make event handlers and jobs **idempotent**: events are delivered at least once.
8. Respect the timeouts: nothing slow in filters, no sleeping. Hand slow work to an event handler, a job or an external service.
9. Escape what you render from users or other systems. React does it for you unless you use `dangerouslySetInnerHTML`, which you must not. Escape values you put into email HTML yourself.
10. Call outside services only through `ctx.http.fetch`.

**Should**
- Return the incoming value unchanged from a filter when you have nothing to add.
- Keep custom field values short (they are clipped to 300 characters) and labels clear.
- Write a `README.md` in the plugin folder: what it does, its settings, and why it needs each permission.

## Reference plugins

| Plugin | Shows |
|---|---|
| `src/plugins/lead-manager` | A complete module: data tables, role permissions, a sidebar section with several pages, form actions, events, a widget and a daily email |
| `src/plugins/invoice-footer` | Settings, the `pdf.sections` filter, a dashboard widget, `ctx.data` |
| `src/plugins/slack-notify` | Event hooks, a secret setting, `ctx.http`, idempotency with `ctx.storage` |
| `src/plugins/po-number` | `document.validate`, `document.beforeSave`, custom fields printed on the PDF, a page, `document.actions` |
| `examples/external-plugin` | The whole external protocol, with no dependencies |

**Lead Manager** is the model for big plugins:

| Piece | How it's done |
|---|---|
| Leads and their timeline | Two data tables: `leads` (indexed by stage, owner, customer and a search field; `value` is a number) and `activities` |
| Pipeline, Leads, Follow-ups | Three pages in a "Lead Manager" sidebar section; a lead's detail and edit screens live under `leads/<id>` |
| Staff see only their own leads | Capability `leads.viewAll` (default Owner, Accountant), checked in the plugin's own queries |
| Convert to customer, quick quotation | Actions using `ctx.data.parties.upsert` and `ctx.data.documents.createQuotation` with `leadRef` |
| Proposal / Won automatically | `quotation.created` and `invoice.issued` events, matched by `leadRef` or customer |
| Morning email | A daily job using `ctx.mail.send` |
| "Today's follow-ups" | A dashboard widget |

---

## External plugins

An external plugin is a web service that MyGST talks to over HTTPS. Any language works; `examples/external-plugin/server.mjs` is a complete reference in about 150 lines. External plugins can't use data tables, jobs, form actions or the UI kit: they keep their own data and render their own pages in a frame.

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

## Package, upload and download

Admins can add a code plugin without a deploy:

1. Build and test it as usual in `src/plugins/<id>/`.
2. Pack it:
   ```bash
   npm run plugin:pack -- <id>                 # → dist-plugins/<id>-<version>.mygst-plugin.js
   npm run plugin:pack -- <id> --id <new-id>   # same code under another id (e.g. to test next to the built-in copy)
   npm run plugin:pack -- --all                # every folder in src/plugins (npm run build does this)
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

**Downloading (super admins only)**
- **Admin → Plugins** has a **Download** link on each plugin (and a Download card on its page), shown only to super admins: people with the built-in *Super admin* platform role or in `SUPER_ADMIN_EMAILS`. It can't be given to custom admin roles.
- Built-in and uploaded plugins download as `<id>-<version>.mygst-plugin.js`, ready to upload on another MyGST. Built-in ones are packed during `npm run build`; if a file is missing it is packed on demand. External plugins download their `manifest.json`.
- The response carries the file's SHA-256 (`X-Checksum-SHA256`), and each download is written to the admin audit log.

## Versioning, upgrades and uninstalling

**Versioning and upgrades**
- Use semver: **patch** for fixes, **minor** for new features, **major** for changes to settings or stored data that old versions can't read.
- Code plugins update with the deploy, uploaded ones when a newer file is uploaded. External plugins update when the admin reloads the manifest.
- Don't rename setting keys, collection names or capability keys. Add new ones and keep reading the old ones.

**Uninstalling and admin controls**
- On uninstall, every company gets `onDisable` (or `plugin.uninstalled`), then `onUninstall` runs.
- For built-in plugins the admin chooses whether to keep or delete the plugin's settings, storage and data tables. Uploaded and external plugins are always removed completely.
- When the admin changes availability or blocks a company, the same `onEnable`/`onDisable` calls happen for the companies affected.

---

## Troubleshooting

| Symptom | What to check |
|---|---|
| The plugin isn't listed in Admin → Plugins | Restart `npm run dev` (the plugin list is generated at start). The folder must contain `index.ts` or `index.tsx`, and its name must be the plugin id. Click **Rescan**. |
| A yellow box says the plugin *failed to load* | The message names the problem: an invalid manifest field, an event or filter used without declaring it, a declared page/widget/job without code, or a missing permission for an event. |
| `npm run lint` fails with "Plugins may only import @/lib/plugins/sdk" | Import types and UI from `@/lib/plugins/sdk` only; copy anything else you need into your folder. |
| The sidebar doesn't show my pages | The plugin must be installed, available to the company and switched on (Settings → Plugins). Pages need `inNav` and the user needs the page's `roles` and `permission`. The super admin may have placed the section elsewhere in Admin → Menu. |
| A page sends me back to the dashboard | You don't hold the page's `roles` or `permission`. Owners hold every capability. A user with only custom roles also needs **Use <plugin>** (under *Apps* in Settings → Roles). |
| "Plugin X needs the Y permission" | Add the permission to `manifest.permissions`. After an upgrade, owners must accept new permissions before the plugin runs for them. |
| My event handler never runs | Declare the event in `events`, with its permission. Check that the plugin is active for the company. In **Admin → System**, check event delivery for failed events, and the plugin's Activity log for errors. |
| An action shows "Something went wrong" | The real error is in the plugin's Activity log. Throw `PluginError` for messages the user should see. |
| "… can't be filtered or sorted: add it to indexes or numbers" | Add the field to the collection's `indexes` (text) or `numbers`. Records saved before the change aren't indexed: re-save them, or write a one-off job. |
| My job doesn't run | The server's cron job must call `/api/cron/tick` every minute (**Admin → System** shows when it last ran). Daily jobs run only from 06:00 IST, once a day per company. |
| The plugin is *Paused* for a company | It failed 20 times in a row. Fix the error (see the Activity log), then the owner turns it on again in Settings → Plugins. |
| An uploaded file is refused or fails to load | Re-pack with `npm run plugin:pack`. Bundles may only `require` react and the SDK; other imports must be bundled. Max 2 MB. |
| Vitest fails to start on Windows | Run it from PowerShell or cmd, not Git Bash. |

---

## Submission checklist

Before opening a pull request that adds `src/plugins/<id>`, or before packing a plugin for upload:

- [ ] `id` equals the folder name; `version`, `name` and a one-sentence `description` are set.
- [ ] Only the permissions it uses; the plugin's README explains each one and lists the settings.
- [ ] Every page, widget, route and action that shows or changes sensitive data has a `permission` (or `roles`).
- [ ] Form and route input is validated; user-visible errors use `PluginError`.
- [ ] Event handlers and jobs are idempotent; nothing slow runs in filters.
- [ ] Secrets only in `secret` settings; nothing sensitive in logs.
- [ ] Data table `indexes` and `numbers` cover every field you filter, sort or sum on.
- [ ] Tests in `tests/unit/plugins/<id>.test.ts` cover the events, actions (including a missing permission) and jobs (`npx vitest run tests/unit/plugins`).
- [ ] `npm run typecheck`, `npm run lint` and `npm run build` pass.
- [ ] Tried in `npm run dev`: install, turn on for a company, use it as an owner and as a user with fewer permissions, turn off, uninstall.
