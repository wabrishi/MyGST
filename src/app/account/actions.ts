"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MOBILE_ERROR, normalizeMobile } from "@/lib/phone";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  phone: z.string().transform((v, ctx) => {
    const phone = normalizeMobile(v);
    if (!phone) ctx.addIssue({ code: "custom", message: MOBILE_ERROR });
    return phone ?? "";
  }),
});

/** The signed-in user's own name and mobile number. */
export async function updateProfile(fields: Record<string, string | boolean>): Promise<ActionResult> {
  return run(async () => {
    const user = await getSessionUser();
    if (!user) throw new UserError("Your session has ended. Sign in again.");
    const data = profileSchema.parse({ name: fields.name, phone: fields.phone });
    await db.user.update({ where: { id: user.id }, data });
    revalidatePath("/", "layout");
    return ok(undefined, "Profile saved");
  });
}
