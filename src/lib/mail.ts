import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

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
    console.info(`[mail:dev] to=${to} subject="${subject}"\n${html.replace(/<[^>]+>/g, " ")}`);
    return;
  }
  await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html, attachments });
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
