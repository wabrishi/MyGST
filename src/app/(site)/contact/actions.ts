"use server";

import { headers } from "next/headers";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { contactSchema, spamCheck } from "@/lib/contact";
import { RateLimited, saveContactMessage } from "@/lib/contact-store";

/** The website contact form. Spam is dropped quietly (the sender sees success, nothing is stored). */
export async function sendContactMessage(fields: Record<string, string | boolean>): Promise<ActionResult> {
  return run(async () => {
    const verdict = spamCheck({ website: fields.website, token: fields.token });
    if (verdict === "honeypot") return ok(undefined, "Thanks! We'll get back to you soon.");
    if (verdict === "too-fast") throw new UserError("That was quick! Please check your message and send it again.");
    if (verdict === "bad-token") throw new UserError("This form has expired. Please reload the page and try again.");

    const input = contactSchema.parse(fields);
    const h = await headers();
    const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
    try {
      await saveContactMessage(input, { ip, userAgent: h.get("user-agent") ?? "" });
    } catch (e) {
      if (e instanceof RateLimited) throw new UserError(e.message);
      throw e;
    }
    return ok(undefined, "Thanks! We'll get back to you soon.");
  });
}
