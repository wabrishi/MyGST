import "server-only";
import { db } from "./db";
import { contactEmailHtml, RATE_LIMIT, type ContactInput } from "./contact";
import { sendMail } from "./mail";
import { getSiteContact } from "./site-store";

export class RateLimited extends Error {}

/**
 * Saves a website message, then emails it to the address set in Admin → Website (or CONTACT_EMAIL). The message is kept even if the email
 * fails, so nothing is lost (it's always in Admin → Messages).
 */
export async function saveContactMessage(input: ContactInput, meta: { ip: string; userAgent: string }) {
  if (meta.ip) {
    const recent = await db.contactMessage.count({ where: { ip: meta.ip, createdAt: { gte: new Date(Date.now() - RATE_LIMIT.windowMs) } } });
    if (recent >= RATE_LIMIT.max) throw new RateLimited("Too many messages from your connection. Please try again in an hour.");
  }
  const msg = await db.contactMessage.create({ data: { ...input, ip: meta.ip.slice(0, 64), userAgent: meta.userAgent.slice(0, 300) } });
  const to = (await getSiteContact()).notifyEmail;
  if (to) {
    try {
      await sendMail({ to, subject: `[Website] ${input.topic}: ${input.name}`.slice(0, 150), html: contactEmailHtml(input) });
    } catch (e) {
      console.error("[contact] email failed:", (e as Error).message);
    }
  }
  return msg.id;
}
