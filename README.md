# MyGST — GST billing for Indian businesses

Multi-company, multi-user GST billing SaaS: tax invoices, quotations, credit/debit notes, purchases with ITC, payments & outstanding, GSTR-1 / GSTR-3B reports and financial-year management.

**Stack:** Next.js 16 (App Router, Server Actions) · TypeScript · Prisma 7 (Rust-free client, MariaDB driver) · MySQL 8 / MariaDB · Better Auth · Tailwind CSS 4 · @react-pdf/renderer · Vitest · Playwright

## Features

| Area | What you get |
|---|---|
| Companies & users | Sign up and create your company, invite users by email as **Owner / Accountant / Staff**. **Each user belongs to exactly one company** (any role), enforced by a unique index on `membership.userId` |
| Super-admin panel | `/admin` for platform operators (emails in `SUPER_ADMIN_EMAILS`): create a company and invite/attach its owner, track setup progress, suspend/reactivate. Admins see counts only, never a company's books |
| Setup wizard | `/c/<id>/setup`: Business & GST → Bank & invoice → Numbering & year → Team → First records. New owners land here; the dashboard shows progress until finished |
| Masters | Customers & suppliers (GSTIN checksum validation, state auto-filled), products/services with HSN/SAC, unit, GST rate |
| Sales | Tax invoices, quotations (→ convert to invoice), credit & debit notes against invoices. CGST+SGST/UTGST vs IGST chosen from place of supply. Tax-inclusive pricing, discounts, round-off, amount in words |
| Numbering | `PREFIX/FY/0001`, ≤16 chars, gap-free and unique per financial year (row-locked, concurrency-tested) |
| PDF | A4 PDF with HSN-wise tax summary, bank/UPI details, terms, signature; download, print or email |
| Payments | Receipts and supplier payments, allocation across invoices/bills (FIFO auto-allocate), advances, paid/partly paid/overdue status |
| Purchases | Supplier bills with ITC classification (eligible / capital goods / ineligible), reverse charge |
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
   - **Build command:** `npm run build` (runs `prisma generate` + `next build --webpack`). The build uses webpack because Turbopack's separate CSS worker processes are killed on Hostinger's build servers.
   - **Start command:** `npm start` (runs `prisma migrate deploy` and then `next start`). Database migrations are applied automatically when the app starts, so the build doesn't need database access.
   - **Output directory:** `.next`
4. **Set environment variables** in the app settings, using `.env.example` as the reference:
   - `DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DBNAME`. URL-encode special characters in the password.
   - `BETTER_AUTH_SECRET`: a long random string. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
   - `BETTER_AUTH_URL` and `APP_URL`: your public `https://` URL, exactly as users open it. Login is rejected from other origins.
   - `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: a mailbox created under *Emails*.
   - `SUPER_ADMIN_EMAILS`: comma-separated emails allowed into `/admin`. Sign up with one of these emails to become a platform admin.
5. **Point your domain and enable SSL** (free SSL in hPanel), then deploy. Each push to the branch redeploys, and pending migrations run automatically when the app starts.
6. **Backups:** enable Hostinger's daily backups. Company owners can also download a full JSON export under *Settings → Company → Export all data*.

Notes:
- Prisma 7 uses a pure-JS driver (`@prisma/adapter-mariadb`), so no native engine binaries are needed on shared hosting.
- Company logos are stored in the database, because the app file system is replaced on every deploy.
- `prisma migrate deploy` does not need a shadow database, so a normal Hostinger DB user is enough. (`prisma migrate dev` is for local use only.)

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

## GST notes & limitations (v1)

- The GSTR-3B page is a working summary from your books. Reconcile ITC with GSTR-2B before filing.
- B2CL threshold: ₹1,00,000 (inter-state, unregistered). Credit notes against small B2C invoices are netted into B2CS.
- Not yet included: e-invoice (IRN/QR, mandatory above ₹5 Cr AATO), e-way bill, export/SEZ invoices, GSTR-1 JSON upload, cess, inventory/stock.
