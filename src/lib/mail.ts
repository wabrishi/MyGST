import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { UserError } from "./user-error";

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

let transporter: Transporter | null = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

export const mailEnabled = () => !!process.env.SMTP_HOST;

/** Sends an email. Without SMTP configured (local dev) the message is logged instead. */
export async function sendMail({ to, subject, html, attachments }: MailInput) {
  const t = getTransporter();
  if (!t) {
    // Links live in href attributes, which stripping the tags would drop — list them so they can be clicked.
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const files = attachments?.length ? `\nAttachments: ${attachments.map((a) => `${a.filename} (${Math.round(a.content.length / 1024)} KB)`).join(", ")}` : "";
    console.info(`[mail:dev] to=${to} subject="${subject}"\n${html.replace(/<[^>]+>/g, " ")}${links.length ? `\nLinks:\n${links.join("\n")}` : ""}${files}`);
    return;
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html, attachments });
  } catch (err) {
    console.error(`[mail] sending to ${to} failed:`, err);
    throw new MailError(mailErrorMessage(err, to));
  }
}

/** The email server refused the message or couldn't be reached. Shown to the user instead of "Something went wrong". */
export class MailError extends UserError {}

/** Plain-language reason for a nodemailer failure, with the server's own reply where there is one. */
export function mailErrorMessage(err: unknown, to: string) {
  const e = (err ?? {}) as { code?: string; command?: string; response?: string; message?: string };
  const reply = (e.response || e.message || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const said = reply ? ` Server said: ${reply}` : "";
  if (e.code === "EAUTH") return "The email server rejected the login. Check SMTP_USER and SMTP_PASS.";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED"].includes(e.code ?? "")) {
    return "Couldn't connect to the email server. Check SMTP_HOST and SMTP_PORT.";
  }
  if (e.command === "MAIL FROM") return `The email server refused the sender address. MAIL_FROM must be the SMTP_USER mailbox's own address.${said}`;
  if (e.code === "EENVELOPE" || e.command === "RCPT TO") return `The email server refused to deliver to ${to}. Check that the address is real.${said}`;
  return `The email couldn't be sent.${said}`;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
