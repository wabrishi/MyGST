/**
 * System email templates: the defaults, the variables each may use, and the renderer. Super admins can
 * edit subject and body in Admin → Emails (saved in email_template; see email-render.ts). Pure module.
 *
 * Syntax: {{name}} inserts a value (HTML-escaped in the body); {{#if name}}…{{/if}} shows a part only
 * when the value isn't empty. Unknown names render as nothing.
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
}

const brandVar = { brand: { help: "Product name", sample: "MyGSTBook" } };

export const TEMPLATES: TemplateDef[] = [
  {
    key: "password_reset",
    label: "Password reset",
    description: "Sent when someone clicks “Forgot password”.",
    vars: { ...brandVar, name: { help: "User's name", sample: "Asha Rao" }, url: { help: "Reset link (valid 1 hour)", sample: "https://example.com/reset-password?token=…" } },
    subject: "Reset your {{brand}} password",
    body: `<p>Hi {{name}},</p>
<p>Click the button below to reset your password. It expires in 1 hour.</p>
<p><a class="btn" href="{{url}}">Reset password</a></p>
<p>If you didn't request this, you can ignore this email.</p>`,
  },
  {
    key: "verify_email",
    label: "Verify email address",
    description: "Sent after sign-up (and when an unverified user tries to sign in). The account can't be used until the link is clicked.",
    vars: { ...brandVar, name: { help: "User's name", sample: "Asha Rao" }, url: { help: "Verification link (valid 24 hours)", sample: "https://example.com/api/auth/verify-email?token=…" } },
    subject: "Confirm your email for {{brand}}",
    body: `<p>Hi {{name}},</p>
<p>Welcome to {{brand}}! Please confirm your email address to finish creating your account.</p>
<p><a class="btn" href="{{url}}">Verify email</a></p>
<p class="muted">The link expires in 24 hours. If you didn't sign up for {{brand}}, you can ignore this email.</p>`,
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
    body: `<p>{{inviterName}} has invited you to join <b>{{companyName}}</b> as <b>{{roles}}</b>.</p>
<p><a class="btn" href="{{url}}">Accept invitation</a></p>
<p>If you don't have a {{brand}} account yet, sign up with this email address first. The link expires in 7 days.</p>`,
  },
  {
    key: "company_ready",
    label: "Company created for you",
    description: "Sent to an existing user when a super admin creates a company for them.",
    vars: { ...brandVar, name: { help: "Owner's name", sample: "Asha Rao" }, companyName: { help: "Company name", sample: "Sharma Traders" }, url: { help: "Setup link", sample: "https://example.com/c/…/setup" } },
    subject: "{{companyName}} is ready on {{brand}}",
    body: `<p>Hi {{name}},</p>
<p>A company <b>{{companyName}}</b> has been created for you. You are its owner.</p>
<p><a class="btn" href="{{url}}">Complete company setup</a></p>`,
  },
  {
    key: "document_email",
    label: "Invoice / quotation / note to customer",
    description: "Sent from a sales document's Email button, with the PDF attached.",
    vars: {
      ...brandVar,
      partyName: { help: "Customer name", sample: "Blue Ocean Pvt Ltd" },
      docType: { help: "Invoice, Quotation, Credit note…", sample: "Invoice" },
      number: { help: "Document number", sample: "INV/26-27/0042" },
      date: { help: "Document date", sample: "2026-11-18" },
      total: { help: "Total amount", sample: "₹6,667.00" },
      companyName: { help: "Your company", sample: "Sharma Traders" },
    },
    subject: "{{docType}} {{number}} from {{companyName}}",
    body: `<p>Dear {{partyName}},</p>
<p>Please find attached {{docType}} <b>{{number}}</b> dated {{date}} for <b>{{total}}</b>.</p>
<p>Regards,<br>{{companyName}}</p>`,
  },
  {
    key: "po_email",
    label: "Purchase order to supplier",
    description: "Sent from a purchase order's Email button, with the PDF attached.",
    vars: {
      ...brandVar,
      partyName: { help: "Supplier name", sample: "Steel Co" },
      number: { help: "PO number", sample: "PO/26-27/0007" },
      date: { help: "PO date", sample: "2026-11-18" },
      total: { help: "Total amount", sample: "₹1,18,000.00" },
      expectedDate: { help: "Expected delivery (may be empty)", sample: "2026-11-30" },
      companyName: { help: "Your company", sample: "Sharma Traders" },
    },
    subject: "Purchase Order {{number}} from {{companyName}}",
    body: `<p>Dear {{partyName}},</p>
<p>Please find attached our purchase order <b>{{number}}</b> dated {{date}} for <b>{{total}}</b>{{#if expectedDate}}, to be delivered by <b>{{expectedDate}}</b>{{/if}}.</p>
<p>Please quote the PO number on your invoice.</p>
<p>Regards,<br>{{companyName}}</p>`,
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
    body: `<p>New message from the website contact form:</p>
<table class="kv">
<tr><td>Name</td><td>{{name}}</td></tr>
<tr><td>Email</td><td>{{email}}</td></tr>
<tr><td>Mobile</td><td>{{mobile}}</td></tr>
{{#if company}}<tr><td>Business</td><td>{{company}}</td></tr>{{/if}}
<tr><td>Topic</td><td>{{topic}}</td></tr>
</table>
<blockquote>{{message}}</blockquote>
<p class="muted">Reply to {{email}}. All messages are also listed in Admin → Messages.</p>`,
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
    body: `<p>Hello {{partyName}},</p>
<p><b>{{companyName}}</b> uses {{brand}} for GST billing and has added you as a business they work with.</p>
<p>Join {{brand}} for free to receive their invoices and purchase orders straight into your own books, and to create GST invoices, track purchases and export your returns.</p>
<p><a class="btn" href="{{url}}">Create your free account</a></p>
<p class="muted">You received this because {{companyName}} added your email address. If you're not interested, you can ignore it; we won't send it again.</p>`,
  },
  {
    key: "document_received",
    label: "Document received from another business",
    description: "Sent to a company when another company on MyGSTBook sends them an invoice, note, quotation or purchase order.",
    vars: {
      ...brandVar,
      companyName: { help: "Receiving company", sample: "Blue Ocean Pvt Ltd" },
      fromCompany: { help: "Sending company", sample: "Sharma Traders" },
      docType: { help: "Invoice, Purchase order…", sample: "Invoice" },
      number: { help: "Document number", sample: "INV/26-27/0042" },
      total: { help: "Total amount", sample: "₹6,667.00" },
      url: { help: "Link to it in the Received inbox", sample: "https://example.com/c/…/received/…" },
    },
    subject: "{{fromCompany}} sent you {{docType}} {{number}}",
    body: `<p>Hello,</p>
<p><b>{{fromCompany}}</b> sent <b>{{companyName}}</b> {{docType}} <b>{{number}}</b> for <b>{{total}}</b> on {{brand}}.</p>
<p><a class="btn" href="{{url}}">Review it</a></p>
<p class="muted">Nothing is added to your books until you accept it.</p>`,
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

/** The shared email layout: a branded card that works in common email clients. */
export function wrapLayout(bodyHtml: string, brand: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<style>
.mg a.btn{display:inline-block;background:#4f46e5;color:#fff !important;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600}
.mg a{color:#4f46e5}.mg .muted{color:#64748b;font-size:13px}
.mg table.kv td{padding:4px 14px 4px 0;font-size:14px}.mg table.kv td:first-child{color:#64748b}
.mg blockquote{margin:12px 0;padding:4px 0 4px 12px;border-left:3px solid #4f46e5;white-space:pre-wrap}
</style>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 14px;font-size:18px;font-weight:700;color:#0f172a">${esc(brand)}</td></tr>
<tr><td class="mg" style="background:#ffffff;border:1px solid #e4e7ec;border-radius:12px;padding:24px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
<tr><td style="padding:14px 4px;font-size:12px;color:#64748b">Sent by ${esc(brand)} · GST billing for Indian businesses</td></tr>
</table></td></tr></table></body></html>`;
}

export const DEFAULT_BRAND = "MyGSTBook";

/** Renders a subject + body pair with values (brand filled in) into a finished email. */
export function renderTemplate(t: { subject: string; body: string }, vars: Record<string, string | null | undefined>) {
  const all = { brand: DEFAULT_BRAND, ...vars };
  return {
    subject: fillTemplate(t.subject, all, false).replace(/\s+/g, " ").trim().slice(0, 250),
    html: wrapLayout(fillTemplate(t.body, all, true), all.brand ?? DEFAULT_BRAND),
  };
}

/** Sample values for previews and test emails. */
export const sampleVars = (def: TemplateDef) => Object.fromEntries(Object.entries(def.vars).map(([k, v]) => [k, v.sample]));
