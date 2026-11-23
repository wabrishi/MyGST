# MyGSTBook — GST billing for Indian businesses

Multi-company, multi-user GST billing SaaS: tax invoices, quotations, credit/debit notes, purchases with ITC, payments & outstanding, GSTR-1 / GSTR-3B reports and financial-year management.

**Stack:** Next.js 16 (App Router, Server Actions) · TypeScript · Prisma 7 (Rust-free client, MariaDB driver) · MySQL 8 / MariaDB · Better Auth · Tailwind CSS 4 · @react-pdf/renderer · Vitest · Playwright

## Features

| Area | What you get |
|---|---|
| Companies & users | Sign up and create your company, invite users by email. **Roles (RBAC):** built-in **Owner / Accountant / Staff** plus custom roles built from individual permissions (*Settings → Roles*); a user can hold **several roles** and gets all their permissions. **Each user belongs to exactly one company**, enforced by a unique index on `membership.userId` |
| Admin console | `/admin` for platform operators: **overview** (KPIs and charts across all companies), **companies** (create, invite owner, track setup, suspend), **users** (disable, sign out, reset password, set a temporary password), **audit log**, **system health** (event delivery, backups, plugin errors, cron, migrations), **plugins**, **menu** (drag and drop to set the order of sidebar sections and items for every company) and **admin roles**. Admins see counts only, never a company's books |
| Public website | Home, **Features**, **Pricing** (plans and prices in `src/lib/site.ts`, monthly/yearly switch), **About** and **Contact**. Contact messages (name, email, **mobile required**) are saved in **Admin → Messages** and emailed, with spam protection (hidden field, minimum fill time, 5 per IP per hour). The super admin sets the website's **mobile number**, WhatsApp, email, address and where messages go in **Admin → Website**; the mobile shows on the Contact page, header and footer. Sitemap and robots included |
| Business network | Companies find each other by **GSTIN**. When you issue an invoice, credit/debit note or quotation to a party whose GSTIN belongs to another company on MyGSTBook (or send a purchase order to such a supplier), it arrives in their **Received** inbox (Purchases → Received). They open it (with your PDF), then **Add to purchases** / **Create purchase order** / **Create invoice** with the form filled in, or reject it. Nothing enters their books without their say; you see its status on your document. Matching needs exactly one company with that GSTIN (duplicates are flagged in Admin → Companies). Supplier credit/debit notes can be viewed and acknowledged, not yet booked |
| Party invitations | New parties with an email get an **Invite to MyGSTBook** tick box (default per company in Settings → Company). Each email is invited at most once, never if they're already on MyGSTBook |
| Email templates | **Admin → Emails**: edit the subject and HTML of every email (password reset, team invite, invoice/PO emails, contact notification, party invite, document received) with variables, a live preview, test send and reset to default |
| Mobile numbers | Sign-up asks for a **mobile number** (Indian 10-digit, or +country code), stored as `+91…`. Users edit it in **My profile** (`/account`, from the account menu); owners see members' numbers in Settings → Users, admins in Admin → Users |
| Sidebar | Sections (Sales, Purchases, Masters, Insights and plugin sections) **expand and collapse**; each user's choice is remembered in their browser, and the section of the open page always shows. The order is set by the super admin in Admin → Menu |
| Setup wizard | `/c/<id>/setup`: Business & GST → Bank & invoice → Numbering & year → Team → First records. New owners land here; the dashboard shows progress until finished |
| Masters | Customers & suppliers (GSTIN checksum validation, state auto-filled), products/services with HSN/SAC, unit, GST rate |
| Sales | Tax invoices, quotations (→ convert to invoice), credit & debit notes against invoices. CGST+SGST/UTGST vs IGST chosen from place of supply. Tax-inclusive pricing, discounts, round-off, amount in words |
| Numbering | `PREFIX/FY/0001`, ≤16 chars, gap-free and unique per financial year (row-locked, concurrency-tested) |
| PDF | A4 PDF with HSN-wise tax summary, bank/UPI details, terms, signature; download, print or email |
| Payments | Receipts and supplier payments, allocation across invoices/bills (FIFO auto-allocate), advances, paid/partly paid/overdue status |
| Purchases | **Purchase orders** to suppliers (own number series `PO/FY/0001`, A4 PDF, email, expected delivery, delivery address, payment terms) billed by one or more **purchase invoices** (partial billing tracks ordered vs billed qty per line: Open → Partly billed → Billed, or Close the rest). Purchase invoices record the supplier's invoice with ITC classification (eligible / capital goods / ineligible) and reverse charge |
| Reports | GSTR-1 (B2B, B2CL, B2CS, CDNR, CDNUR, HSN B2B/B2C, documents issued) with offline-tool CSVs; GSTR-3B summary; sales & purchase registers; receivable/payable ageing; party ledger |
| Financial years | Year switcher (lists, reports and dashboard follow it), quarterly presets, **close/re-open a year** (locks all transactions dated in it) |
| Safety | Issued documents are cancelled, never deleted; audit log; strict tenant isolation; JSON data export |
| Backups | **Twice-daily automatic backups to Google Drive**, 30-day retention. Super-admin: whole platform (`/admin/backups`). Owners: their own company to their own Drive (*Settings → Backup*). Manual "Back up now" and run history |

## Local development

Requirements: Node 20.9+ (24 recommended), Docker (for MySQL).

```bash
docker compose up -d                 # MySQL 8.4 on localhost:3307 (user root/root, db mygst)
cp .env.example .env                 # then set DATABASE_URL=mysql://root:root@localhost:3307/mygst
npm install                          # also runs `prisma generate`
npm run db:migrate                   # apply migrations
npm run dev                          # http://localhost:3000
```

Without `SMTP_HOST`, emails (password reset, invites, invoices) are printed to the server console, and invite links are shown on screen.

### Tests

```bash
npm test                    # unit tests — GST engine (tax split, rounding, GSTIN, FY, words)
npm run test:integration    # numbering under concurrency (uses DATABASE_URL)
npm run test:e2e            # Playwright: full browser flows (starts/reuses the dev server)
npm run typecheck && npm run lint
```

On Windows run Vitest from PowerShell or cmd. Git Bash's lowercase `/c/` drive path makes Vite load the runner twice.

## Project layout

```
prisma/schema.prisma          data model (every business table carries companyId)
src/lib/gst/                  pure GST engine: states, GSTIN, FY, calc (integer paise), amount in words
src/lib/tenant.ts             requireCompany() — the tenant + role guard used by every page/action/route
src/lib/permissions.ts        role → permission matrix
src/lib/documents.ts          invoices / quotations / notes service
src/lib/payments.ts           payments & allocation
src/lib/purchases.ts          purchase bills
src/lib/numbering.ts          gap-free FY numbering (SELECT … FOR UPDATE)
src/lib/fy-context.ts         selected FY + year locking
src/lib/reports/              GSTR-1, GSTR-3B, registers, ageing, ledger, CSV
src/lib/pdf/                  invoice PDF
src/app/c/[companyId]/…       the app (one route set serves invoices/quotations/credit-notes/debit-notes)
```

## Deploying to Hostinger (Business / Cloud web hosting)

Hostinger's managed hosting provides **MySQL/MariaDB** and **Node.js app hosting**. hPanel menu names change from time to time, so treat the labels below as approximate.

1. **Create the database.** In hPanel, go to *Databases → MySQL Databases* and create a database and a user. Note the host: usually `localhost` for apps on the same plan, or the remote host shown in hPanel.
2. **Push this project to a private GitHub repository.** `.env` is git-ignored.
3. **Create the Node.js app.** In hPanel, go to *Websites → Add website → Node.js app*, import the GitHub repo, and pick framework **Next.js**.
   - **Node.js version: 22 or 24.** Node 20 is too old for several dependencies.
   - **Build command:** `npm run build` (packs the plugins, runs `prisma generate` and `next build --webpack`). The build uses webpack because Turbopack's separate CSS worker processes are killed on Hostinger's build servers.
   - **Start command:** `npm start`. If hPanel doesn't let you set it, that's fine: see migrations below.
   - **Database migrations are applied automatically when the app starts**, however Hostinger starts it (`npm start` or `next start` directly). The server applies any pending migration before it handles the first request, and logs `[migrate] applying …`. The build doesn't need database access. Set `AUTO_MIGRATE=false` to turn this off.
   - **Output directory:** `.next`
4. **Set environment variables** in the app settings, using `.env.example` as the reference:
   - `DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DBNAME`. URL-encode special characters in the password.
   - `BETTER_AUTH_SECRET`: a long random string. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
   - `BETTER_AUTH_URL` and `APP_URL`: your public `https://` URL, exactly as users open it. Login is rejected from other origins.
   - `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: a mailbox created under *Emails*.
   - Website contact details (mobile, WhatsApp, email, address, where messages go): set them in **Admin → Website**. `CONTACT_EMAIL`, `CONTACT_PHONE`, `CONTACT_ADDRESS`, `CONTACT_WHATSAPP` and `CONTACT_NOTIFY_EMAIL` still work as defaults.
   - `SUPER_ADMIN_EMAILS`: comma-separated emails that are always full super admins (break-glass: they can't be locked out). Sign up with one of these emails, then give other staff limited access with **Admin → Users → Admin roles** (Super admin, Support, Viewer or your own roles).
5. **Point your domain and enable SSL** (free SSL in hPanel), then deploy. Each push to the branch redeploys, and pending migrations run automatically when the app starts.
6. **Backups:** enable Hostinger's daily backups. Company owners can also download a full JSON export under *Settings → Company → Export all data*.

Notes:
- Prisma 7 uses a pure-JS driver (`@prisma/adapter-mariadb`), so no native engine binaries are needed on shared hosting.
- Company logos are stored in the database, because the app file system is replaced on every deploy.
- Migrations need no shadow database, so a normal Hostinger DB user is enough. (`prisma migrate dev` is for local use only.)
- **Checking migrations:** *Admin → System → Migrations* lists what's applied, what's pending and any error from the last start. A super admin can click **Apply pending migrations** there instead of restarting.
- **If a migration fails,** the app keeps running on the old schema and the error shows on *Admin → System*. Later starts don't retry it until it's resolved: fix the cause, then mark it with `npx prisma migrate resolve --rolled-back <name>` (to retry) or `--applied <name>` (if you finished it by hand), and restart or click **Apply pending migrations**.
- **An existing database without migration history** (the `_prisma_migrations` table is missing) is never touched automatically; baseline it first.

## Backups to Google Drive

**What gets backed up**

- **Platform (super-admin):** every table (users, companies, documents, payments…) as gzipped NDJSON (`mygst-platform-<time>.ndjson.gz`). This is your disaster-recovery copy.
- **Company (owner):** that company's data as gzipped JSON (`mygst-<company>-<time>.json.gz`), stored in the owner's own Drive.
- Runs twice a day. Files older than 30 days are deleted automatically. Each run is recorded with its status and any error.

**One-time Google setup** (done by you, the operator)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Drive API**.
2. Configure the *OAuth consent screen*: External, app name "MyGST", scopes `drive.file`, `openid`, `email`. Publish it to *In production* so refresh tokens don't expire after 7 days. `drive.file` is a non-sensitive scope, so Google verification isn't required.
3. Create an *OAuth client ID* of type **Web application**, with authorized redirect URI `https://your-domain.com/api/backup/google/callback`. Use `http://localhost:3000/...` for local testing.
4. Set the environment variables `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BACKUP_ENCRYPTION_KEY` and `CRON_SECRET`.
5. Connect Drive: *Admin → Backups → Connect Google Drive* for the platform, or *Settings → Backup* for a company.

**Scheduling**

- **Built-in scheduler (optional, off by default):** set `BACKUP_INTERNAL_SCHEDULER="true"` to have `src/instrumentation.ts` check every 15 minutes. Use it for a VPS or local runs. Leave it off on Hostinger, where background timers stop on restarts.
- **Hostinger Cron Job (recommended),** in case the app sleeps when idle: in hPanel → Advanced → Cron Jobs, add twice daily:
  ```
  0 2,14 * * *  curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-domain.com/api/cron/backup
  ```
- Both are safe together: a target is only backed up if its last success is more than ~11 h old, and runs can't overlap. Add `?force=1` to the cron URL to back up everything immediately.

**Security**

- MyGST requests only `drive.file`: it can create and see only its own backup files, never the rest of the Drive.
- Refresh tokens are stored encrypted (AES-256-GCM).
- Platform backups contain every customer's data, including password hashes. Connect a Google account you control and protect with 2FA.

**Restoring:** company backups use the same format as *Export all data*. A guided restore tool is not built yet; restore is done by the operator.

## Suite API (`/api/v1`) and events

For the suite (Lead Manager, WBportal). The contract is in `LeadManager/docs/ARCHITECTURE.md` §4, §5 and §7.

- **Auth:** owners create keys under *Settings → API keys*. Keys look like `mgk_…`, are shown once, and only their SHA-256 hash is stored. Requests send `Authorization: Bearer <key>`. A key acts as the owner who created it and stops working if that user leaves the company or the key is revoked. `X-Suite-Workspace` is accepted but ignored: the key decides the company. `Idempotency-Key` replays the first response for the same route for 24 h, marked with the `Idempotent-Replayed: true` header.
- **Errors:** `{ "error": "message" }` with 400 (validation), 401 (key), 403 (suspended company), 415/413 (body), or 422 (business rule, e.g. unknown partyId).

| Endpoint | Body / query | Response |
|---|---|---|
| `POST /api/v1/parties/upsert` | `{ name, phone, email, gstin, stateCode, billingAddress, externalRef }` | `201 { id, created: true }` or `200 { id, created: false }` |
| `POST /api/v1/quotations` | `{ partyId, items: [{ name, hsn, qty, rate, gstRate }], notes, leadRef }` | `201 { id, number, url, total }` |
| `GET /api/v1/documents?leadRef=…` | — | `{ data: [{ id, kind, number, total, status, url, date }] }` |

- **Party matching:** GSTIN first, then phone (last 10 digits, ignoring formatting), then `externalRef`. A match only fills empty fields. An empty `stateCode` falls back to the GSTIN's state, then the company's own state.
- **`leadRef`:** stored on the quotation (`document.externalRef`) and inherited by the invoice it is converted into.
- **Events:** owners set the Lead Manager webhook URL under *Settings → Integrations*.
  - **Types:** `quotation.created`, `quotation.converted`, `invoice.issued`, `invoice.cancelled`, `payment.received`.
  - **Delivery:** written to `outbox_event` in the same transaction as the change, and delivered right after the request.
  - **Retries:** a Hostinger Cron Job calls `GET /api/cron/tick` every minute with `Authorization: Bearer CRON_SECRET`. Failed deliveries retry after 1 m, 5 m, 30 m, 2 h and 12 h, then are marked failed.
  - **Signing:** `X-Suite-Event-Id`, `X-Suite-Timestamp`, and `X-Suite-Signature: v1=<hex HMAC-SHA256(secret, "<ts>.<body>")>`.

## Roles and permissions

**In a company** (*Settings → Roles* and *Settings → Users*)
- Built-in roles: **Owner** (everything), **Accountant** (billing, payments, purchases, reports) and **Staff** (create invoices, quotations and masters). Their permissions are defined in `src/lib/permissions.ts`.
- **Custom roles** pick individual permissions, including access to each plugin's pages (*Apps*) and the permissions plugins add themselves (for example Lead Manager's *Convert leads to customers*).
- A member can hold **several roles**; their permissions are the union.
- Members can only give roles that don't exceed their own access, only an Owner can change another Owner, and a company always keeps at least one Owner.

**In the admin panel** (*Admin → Roles*, assigned on a user's admin page)
- Built-in: **Super admin** (everything), **Support** (companies, users, password help, audit log), **Viewer** (read-only overview, companies, system health), plus custom admin roles.
- People in `SUPER_ADMIN_EMAILS` are always full super admins.
- Every admin action is recorded in the audit log (*Admin → Audit*).

## Plugins

MyGST can be extended with plugins, managed by the super admin in **Admin → Plugins**:

- **Code plugins** live in `src/plugins/<id>/` and ship with a deploy, or are **packed** (`npm run plugin:pack -- <id>`) and **uploaded** in Admin → Plugins without a deploy (trusted code, stored in the database). They can hook into events, validate or enrich documents, add PDF sections, pages, dashboard widgets, reports and settings. Big plugins (inventory, accounting, CRM) also get **data tables**, their own **role permissions**, **form actions** with a UI kit, a **sidebar section** and **scheduled jobs**.
- **External plugins** run on their own server and are installed from a manifest URL. They receive signed events, call `/api/v1` with a key limited to their permissions, and show pages in a frame.

Super admins can **download** any plugin from Admin → Plugins (built-in and uploaded ones as an uploadable `.mygst-plugin.js`, external ones as `manifest.json`) to back it up or move it to another MyGST.

When installing, the super admin chooses whether the plugin starts **on by default** and who it's **available to**: all companies (with per-company blocks), selected companies, or nobody (kill switch). Owners turn available plugins on or off and configure them in **Settings → Plugins**.

Building one: the **[plugin developer guide](docs/plugins/README.md)** walks you through a complete plugin step by step (a stock tracker: data, events, pages, forms, permissions, a daily job, tests, packing and upload) and has recipes and a full reference. Or start with `npm run plugin:new -- my-plugin "My plugin"`. The examples are `invoice-footer`, `slack-notify`, `po-number` and `examples/external-plugin`; **`lead-manager`** (leads, pipeline, follow-ups, convert to customer and quotation, morning email) is the reference for a big plugin.

## GST notes & limitations (v1)

- The GSTR-3B page is a working summary from your books. Reconcile ITC with GSTR-2B before filing.
- B2CL threshold: ₹1,00,000 (inter-state, unregistered). Credit notes against small B2C invoices are netted into B2CS.
- Not yet included: e-invoice (IRN/QR, mandatory above ₹5 Cr AATO), e-way bill, export/SEZ invoices, GSTR-1 JSON upload, cess, inventory/stock.
