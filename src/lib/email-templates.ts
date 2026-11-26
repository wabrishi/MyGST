/**
 * System email templates: the defaults, the variables each may use, and the renderer. Super admins can
 * edit subject and body in Admin → Emails (saved in email_template; see email-render.ts). Pure module.
 *
 * Syntax: {{name}} inserts a value (HTML-escaped in the body); {{#if name}}…{{/if}} shows a part only
 * when the value isn't empty. Unknown names render as nothing.
 *
 * Building blocks for bodies (styled for email clients by inlineEmailStyles):
 *   <h1>Heading</h1>, <p>, <p class="muted">, <p class="sign">, <p class="fallback">, <ul><li>, <blockquote>, <hr>
 *   <a class="btn" href="…">Button</a>
 *   <table class="summary"><tr><td>Label</td><td>Value</td></tr> … <tr class="total">…</tr></table>
 */

export type TemplateKey =
  | "password_reset"
  | "verify_email"
  | "member_invite"
  | "company_ready"
  | "document_email"
  | "po_email"
  | "contact_notification"
  | "party_invite"
  | "document_received";

export interface TemplateDef {
  key: TemplateKey;
  label: string;
  description: string;
  /** name → what it is (shown in the editor) and a sample value (for previews and test emails). */
  vars: Record<string, { help: string; sample: string }>;
  subject: string;
  body: string;
  /** The real email carries the document's PDF as an attachment (test emails attach a sample). */
  attachesPdf?: boolean;
}

const brandVar = { brand: { help: "Product name", sample: "MyGSTBook" } };

/** "Button not working?" line under a button (links are long; it wraps). */
const fallback = (v: string) => `<p class="fallback">Button not working? Copy this link into your browser:<br><a href="{{${v}}}">{{${v}}}</a></p>`;

export const TEMPLATES: TemplateDef[] = [
  {
    key: "password_reset",
    label: "Password reset",
    description: "Sent when someone clicks “Forgot password”.",
    vars: { ...brandVar, name: { help: "User's name", sample: "Asha Rao" }, url: { help: "Reset link (valid 1 hour)", sample: "https://example.com/reset-password?token=…" } },
    subject: "Reset your {{brand}} password",
    body: `<h1>Reset your password</h1>
<p>Hi {{name}},</p>
<p>We received a request to reset the password for your {{brand}} account. Click the button below to choose a new one.</p>
<a class="btn" href="{{url}}">Reset password</a>
<p class="muted">This link expires in 1 hour. If you didn't ask to reset your password, you can safely ignore this email; your password won't change.</p>
${fallback("url")}`,
  },
  {
    key: "verify_email",
    label: "Verify email address",
    description: "Sent after sign-up (and when an unverified user tries to sign in). The account can't be used until the link is clicked.",
    vars: { ...brandVar, name: { help: "User's name", sample: "Asha Rao" }, url: { help: "Verification link (valid 24 hours)", sample: "https://example.com/api/auth/verify-email?token=…" } },
    subject: "Confirm your email for {{brand}}",
    body: `<h1>Confirm your email address</h1>
<p>Hi {{name}},</p>
<p>Welcome to {{brand}}! To finish creating your account, please confirm that this is your email address.</p>
<a class="btn" href="{{url}}">Verify email address</a>
<p class="muted">This link expires in 24 hours. If you didn't create a {{brand}} account, you can ignore this email.</p>
${fallback("url")}`,
  },
  {
    key: "member_invite",
    label: "Team invitation",
    description: "Sent when an owner invites someone to their company (and for new companies created by an admin).",
    vars: {
      ...brandVar,
      inviterName: { help: "Who sent the invite", sample: "Asha Rao" },
      companyName: { help: "Company name", sample: "Sharma Traders" },
      roles: { help: "Roles they'll get", sample: "Accountant" },
      url: { help: "Accept link (valid 7 days)", sample: "https://example.com/invite/…" },
    },
    subject: "{{inviterName}} invited you to {{companyName}} on {{brand}}",
    body: `<h1>Join {{companyName}} on {{brand}}</h1>
<p>Hello,</p>
<p><b>{{inviterName}}</b> has invited you to work with <b>{{companyName}}</b> on {{brand}}.</p>
<table class="summary">
<tr><td>Company</td><td>{{companyName}}</td></tr>
<tr><td>Invited by</td><td>{{inviterName}}</td></tr>
<tr><td>Your role</td><td>{{roles}}</td></tr>
</table>
<a class="btn" href="{{url}}">Accept invitation</a>
<p class="muted">New to {{brand}}? Create your account with this email address to accept. The invitation expires in 7 days.</p>
${fallback("url")}`,
  },
  {
    key: "company_ready",
    label: "Company created for you",
    description: "Sent to an existing user when a super admin creates a company for them.",
    vars: { ...brandVar, name: { help: "Owner's name", sample: "Asha Rao" }, companyName: { help: "Company name", sample: "Sharma Traders" }, url: { help: "Setup link", sample: "https://example.com/c/…/setup" } },
    subject: "{{companyName}} is ready on {{brand}}",
    body: `<h1>Your company is ready</h1>
<p>Hi {{name}},</p>
<p>We've set up <b>{{companyName}}</b> on {{brand}}, and you're its owner. Add a few details, such as your address, bank account and invoice settings, and you can start billing straight away.</p>
<a class="btn" href="{{url}}">Complete setup</a>
${fallback("url")}`,
  },
  {
    key: "document_email",
    attachesPdf: true,
    label: "Invoice / quotation / note to customer",
    description: "Sent from a sales document's Email button, with the PDF attached.",
    vars: {
      ...brandVar,
      partyName: { help: "Customer name", sample: "Blue Ocean Pvt Ltd" },
      docType: { help: "Invoice, Quotation, Credit note…", sample: "Invoice" },
      number: { help: "Document number", sample: "INV/26-27/0042" },
      date: { help: "Document date", sample: "18 Nov 2026" },
      total: { help: "Total amount", sample: "₹6,667.00" },
      companyName: { help: "Your company", sample: "Sharma Traders" },
    },
    subject: "{{docType}} {{number}} from {{companyName}}",
    body: `<h1>{{docType}} {{number}}</h1>
<p>Dear {{partyName}},</p>
<p>Thank you for your business. Please find attached {{docType}} <b>{{number}}</b> from {{companyName}}.</p>
<table class="summary">
<tr><td>{{docType}} no.</td><td>{{number}}</td></tr>
<tr><td>Date</td><td>{{date}}</td></tr>
<tr class="total"><td>Amount</td><td>{{total}}</td></tr>
</table>
<p>The PDF copy is attached to this email. For any questions about it, please contact {{companyName}}.</p>
<p class="sign">Warm regards,<br><b>{{companyName}}</b></p>`,
  },
  {
    key: "po_email",
    attachesPdf: true,
    label: "Purchase order to supplier",
    description: "Sent from a purchase order's Email button, with the PDF attached.",
    vars: {
      ...brandVar,
      partyName: { help: "Supplier name", sample: "Steel Co" },
      number: { help: "PO number", sample: "PO/26-27/0007" },
      date: { help: "PO date", sample: "18 Nov 2026" },
      total: { help: "Total amount", sample: "₹1,18,000.00" },
      expectedDate: { help: "Expected delivery (may be empty)", sample: "30 Nov 2026" },
      companyName: { help: "Your company", sample: "Sharma Traders" },
    },
    subject: "Purchase Order {{number}} from {{companyName}}",
    body: `<h1>Purchase Order {{number}}</h1>
<p>Dear {{partyName}},</p>
<p>Please find attached our purchase order <b>{{number}}</b>. Kindly confirm it and arrange the supply as per the order.</p>
<table class="summary">
<tr><td>PO no.</td><td>{{number}}</td></tr>
<tr><td>Date</td><td>{{date}}</td></tr>
{{#if expectedDate}}<tr><td>Deliver by</td><td>{{expectedDate}}</td></tr>{{/if}}
<tr class="total"><td>Order value</td><td>{{total}}</td></tr>
</table>
<p>Please mention the PO number on your invoice and delivery challan.</p>
<p class="sign">Regards,<br><b>{{companyName}}</b></p>`,
  },
  {
    key: "contact_notification",
    label: "Website contact message",
    description: "Sent to your team when someone uses the website's Contact page.",
    vars: {
      ...brandVar,
      name: { help: "Visitor's name", sample: "Ravi Kumar" },
      email: { help: "Visitor's email", sample: "ravi@example.com" },
      mobile: { help: "Visitor's mobile", sample: "+91 98765 43210" },
      company: { help: "Business name (may be empty)", sample: "Kumar Stores" },
      topic: { help: "Topic", sample: "sales" },
      message: { help: "The message", sample: "I'd like to know more about pricing." },
    },
    subject: "[Website] {{topic}}: {{name}}",
    body: `<h1>New website enquiry</h1>
<p>Someone has sent a message through the contact form.</p>
<table class="summary">
<tr><td>Name</td><td>{{name}}</td></tr>
<tr><td>Email</td><td>{{email}}</td></tr>
<tr><td>Mobile</td><td>{{mobile}}</td></tr>
{{#if company}}<tr><td>Business</td><td>{{company}}</td></tr>{{/if}}
<tr><td>Topic</td><td>{{topic}}</td></tr>
</table>
<blockquote>{{message}}</blockquote>
<a class="btn" href="mailto:{{email}}">Reply to {{name}}</a>
<p class="muted">All messages are also listed in Admin → Messages.</p>`,
  },
  {
    key: "party_invite",
    label: "Invitation to a customer or supplier",
    description: "Sent when a company adds a party who isn't on MyGSTBook yet (and the invite box is ticked).",
    vars: {
      ...brandVar,
      partyName: { help: "The party's name", sample: "Blue Ocean Pvt Ltd" },
      companyName: { help: "Company that added them", sample: "Sharma Traders" },
      url: { help: "Sign-up link", sample: "https://example.com/signup?invite=…" },
    },
    subject: "{{companyName}} invites you to {{brand}}",
    body: `<h1>{{companyName}} invites you to {{brand}}</h1>
<p>Hello {{partyName}},</p>
<p><b>{{companyName}}</b> manages its GST billing on {{brand}} and has added your business as one they work with. With a free account you can:</p>
<ul>
<li>Receive their invoices and purchase orders directly in your own books</li>
<li>Create GST invoices, quotations and purchase orders in seconds</li>
<li>Track payments and export GSTR-1 and GSTR-3B data</li>
</ul>
<a class="btn" href="{{url}}">Create your free account</a>
<p class="muted">You're receiving this one-time invitation because {{companyName}} added your email address. If you're not interested, simply ignore it; we won't email you about it again.</p>`,
  },
  {
    key: "document_received",
    attachesPdf: true,
    label: "Document received from another business",
    description: "Sent to a company when another company on MyGSTBook sends them an invoice, note, quotation, purchase order or payment.",
    vars: {
      ...brandVar,
      companyName: { help: "Receiving company", sample: "Blue Ocean Pvt Ltd" },
      fromCompany: { help: "Sending company", sample: "Sharma Traders" },
      docType: { help: "Invoice, Purchase order…", sample: "Invoice" },
      number: { help: "Document number", sample: "INV/26-27/0042" },
      total: { help: "Total amount", sample: "₹6,667.00" },
      url: { help: "Link to it in the Received inbox", sample: "https://example.com/c/…/received/…" },
      attached: { help: "Not empty when the PDF is attached (payments have none)", sample: "yes" },
    },
    subject: "{{fromCompany}} sent you {{docType}} {{number}}",
    body: `<h1>You've received a document</h1>
<p>Hello,</p>
<p><b>{{fromCompany}}</b> has sent <b>{{companyName}}</b> a {{docType}} on {{brand}}.</p>
<table class="summary">
<tr><td>From</td><td>{{fromCompany}}</td></tr>
<tr><td>Document</td><td>{{docType}} {{number}}</td></tr>
<tr class="total"><td>Amount</td><td>{{total}}</td></tr>
</table>
<a class="btn" href="{{url}}">Review document</a>
<p class="muted">{{#if attached}}The PDF is attached. {{/if}}Nothing is added to your books until you review and accept it.</p>
${fallback("url")}`,
  },
];

export const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key);
export const templateDef = (key: string) => TEMPLATES.find((t) => t.key === key) ?? null;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Fills {{var}} and {{#if var}}…{{/if}}. `escape` HTML-escapes values (bodies); subjects stay plain. */
export function fillTemplate(text: string, vars: Record<string, string | null | undefined>, escape: boolean) {
  const val = (k: string) => vars[k] ?? "";
  const withIfs = text.replace(/\{\{#if\s+([\w]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, k: string, inner: string) => (val(k).trim() ? inner : ""));
  return withIfs.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, k: string) => (escape ? esc(val(k)) : val(k)));
}

/** Names used in a template ({{x}} and {{#if x}}). */
export function usedVars(text: string) {
  const names = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*(?:#if\s+)?([\w]+)\s*\}\}/g)) names.add(m[1]);
  return [...names];
}

// ───────────────────────── Layout ─────────────────────────
// Styles are written onto each element ("inlined"): Gmail and Outlook ignore most <style> rules.

export const DEFAULT_BRAND = "MyGSTBook";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = { brand: "#4f46e5", ink: "#0f172a", text: "#334155", muted: "#64748b", faint: "#94a3b8", line: "#e2e8f0", panel: "#f8fafc", page: "#f1f5f9" };

const STYLE = {
  h1: `margin:0 0 20px;font-family:${FONT};font-size:22px;line-height:1.35;font-weight:700;color:${C.ink}`,
  h2: `margin:24px 0 12px;font-family:${FONT};font-size:17px;line-height:1.4;font-weight:600;color:${C.ink}`,
  p: `margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.text}`,
  muted: `margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.muted}`,
  fallback: `margin:24px 0 0;padding-top:16px;border-top:1px solid ${C.line};font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint};word-break:break-all`,
  sign: `margin:28px 0 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.text}`,
  a: `color:${C.brand};text-decoration:underline`,
  ul: `margin:0 0 20px;padding:0 0 0 22px;font-family:${FONT};color:${C.text}`,
  li: `margin:0 0 8px;font-size:15px;line-height:1.6`,
  blockquote: `margin:0 0 24px;padding:14px 18px;background:${C.panel};border-left:3px solid ${C.brand};font-family:${FONT};font-size:15px;line-height:1.6;color:${C.text};white-space:pre-wrap`,
  hr: `border:0;border-top:1px solid ${C.line};margin:24px 0`,
  table: `width:100%;margin:4px 0 24px;border-collapse:separate;border-spacing:0;background:${C.panel};border:1px solid ${C.line};border-radius:10px`,
};

/** A button built as a table cell: the form every email client (Outlook included) shows as a button. */
const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td style="border-radius:8px;background:${C.brand}">` +
  `<a href="${href}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px">${label}</a></td></tr></table>`;

/** Label/value panel (<table class="summary">, or the older class="kv"); <tr class="total"> is a bold row. */
function summaryTable(inner: string) {
  const rows = [...inner.matchAll(/<tr(\s+class="total")?\s*>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)];
  if (!rows.length) return `<table role="presentation" style="${STYLE.table}">${inner}</table>`;
  const html = rows
    .map(([, total, label, value], i) => {
      const edge = i < rows.length - 1 ? `border-bottom:1px solid ${C.line};` : "";
      const size = total ? "font-size:16px;font-weight:700" : "font-size:14px;font-weight:600";
      return (
        `<tr><td style="${edge}padding:11px 16px;font-family:${FONT};font-size:14px;color:${C.muted}">${label}</td>` +
        `<td align="right" style="${edge}padding:11px 16px;font-family:${FONT};${size};color:${C.ink};text-align:right">${value}</td></tr>`
      );
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${STYLE.table}">${html}</table>`;
}

/** Turns the simple tags and classes used in template bodies into email-safe, inline-styled HTML. */
export function inlineEmailStyles(html: string) {
  return (
    html
      // Buttons (a <p> around one would wrap a table, so it's dropped).
      .replace(/<p>\s*(<a\s+class="btn"[^>]*>[\s\S]*?<\/a>)\s*<\/p>/g, "$1")
      .replace(/<a\s+class="btn"\s+href="([^"]*)"\s*>([\s\S]*?)<\/a>/g, (_m, href: string, label: string) => button(href, label))
      .replace(/<table\s+class="(?:summary|kv)"\s*>([\s\S]*?)<\/table>/g, (_m, inner: string) => summaryTable(inner))
      .replace(/<h1>/g, `<h1 style="${STYLE.h1}">`)
      .replace(/<h2>/g, `<h2 style="${STYLE.h2}">`)
      .replace(/<p\s+class="muted"\s*>/g, `<p style="${STYLE.muted}">`)
      .replace(/<p\s+class="fallback"\s*>/g, `<p style="${STYLE.fallback}">`)
      .replace(/<p\s+class="sign"\s*>/g, `<p style="${STYLE.sign}">`)
      .replace(/<p>/g, `<p style="${STYLE.p}">`)
      .replace(/<ul>/g, `<ul style="${STYLE.ul}">`)
      .replace(/<li>/g, `<li style="${STYLE.li}">`)
      .replace(/<blockquote>/g, `<blockquote style="${STYLE.blockquote}">`)
      .replace(/<hr\s*\/?>/g, `<hr style="${STYLE.hr}">`)
      // Plain links (buttons already carry a style).
      .replace(/<a\s+(?![^>]*\bstyle=)([^>]*)>/g, `<a $1 style="${STYLE.a}">`)
  );
}

/** "MyGSTBook" → "MyGST" + accented "Book"; any other brand as plain text. */
const wordmark = (brand: string) => (brand === DEFAULT_BRAND ? `MyGST<span style="color:${C.brand}">Book</span>` : esc(brand));

/** The shared email layout: logo header, white card, footer. Works in Gmail, Outlook and Apple Mail. */
export function wrapLayout(bodyHtml: string, brand: string, opts: { title?: string; preheader?: string } = {}) {
  const year = new Date().getFullYear();
  const initial = esc((brand.trim()[0] ?? "M").toUpperCase());
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(opts.title ?? brand)}</title>
<style>@media (max-width:620px){.card{padding:28px 22px !important}.outer{padding:20px 10px !important}}</style>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${esc(opts.preheader ?? "")}&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}"><tr><td align="center" class="outer" style="padding:36px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td style="padding:0 4px 20px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;background:${C.brand};border-radius:9px;font-family:${FONT};font-size:17px;font-weight:700;color:#ffffff">${initial}</td>
<td style="padding-left:10px;font-family:${FONT};font-size:19px;font-weight:700;letter-spacing:-0.2px;color:${C.ink}">${wordmark(brand)}</td>
</tr></table>
</td></tr>
<tr><td class="card" style="background:#ffffff;border:1px solid ${C.line};border-top:4px solid ${C.brand};border-radius:12px;padding:36px 40px;font-family:${FONT}">
${inlineEmailStyles(bodyHtml)}
</td></tr>
<tr><td style="padding:24px 12px 8px;text-align:center;font-family:${FONT};font-size:12px;line-height:1.7;color:${C.faint}">
<b style="color:${C.muted}">${esc(brand)}</b> · GST billing, purchases and returns for Indian businesses<br>
This is an automated email. Please don't reply to it directly.<br>
© ${year} ${esc(brand)}
</td></tr>
</table></td></tr></table>
</body></html>`;
}

/** Inbox preview text: the email's opening words (after the heading). */
const preheaderOf = (html: string) =>
  html
    .replace(/<h1[\s\S]*?<\/h1>/, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

/** Renders a subject + body pair with values (brand filled in) into a finished email. */
export function renderTemplate(t: { subject: string; body: string }, vars: Record<string, string | null | undefined>) {
  const all = { brand: DEFAULT_BRAND, ...vars };
  const subject = fillTemplate(t.subject, all, false).replace(/\s+/g, " ").trim().slice(0, 250);
  const body = fillTemplate(t.body, all, true);
  return { subject, html: wrapLayout(body, all.brand ?? DEFAULT_BRAND, { title: subject, preheader: preheaderOf(body) }) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-18" → "18 Nov 2026" for emails (anything else is returned as is). */
export function emailDate(iso: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (iso ?? "");
}

/** Sample values for previews and test emails. */
export const sampleVars = (def: TemplateDef) => Object.fromEntries(Object.entries(def.vars).map(([k, v]) => [k, v.sample]));
