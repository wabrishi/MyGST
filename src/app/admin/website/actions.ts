"use server";

import { revalidatePath } from "next/cache";
import { ok, run, type ActionResult } from "@/lib/action";
import { adminAudit, requireAdminAction } from "@/lib/admin";
import { saveSiteContact } from "@/lib/site-store";

/** Saves the website's contact details (mobile, WhatsApp, email, address, where messages go). */
export async function adminSaveSiteContact(fields: Record<string, string | boolean>): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("website.manage");
    const sameWhatsapp = fields.sameWhatsapp === true || fields.sameWhatsapp === "on";
    const saved = await saveSiteContact({
      mobile: String(fields.mobile ?? ""),
      whatsapp: sameWhatsapp ? String(fields.mobile ?? "") : String(fields.whatsapp ?? ""),
      email: String(fields.email ?? ""),
      address: String(fields.address ?? ""),
      notifyEmail: String(fields.notifyEmail ?? ""),
    });
    await adminAudit(admin, "website.update", "website", null, saved as unknown as Record<string, string>);
    revalidatePath("/", "layout"); // the whole public website shows these
    return ok(undefined, "Contact details saved. They're live on the website now.");
  });
}
