"use server";

import { revalidatePath } from "next/cache";
import { ok, run, type ActionResult } from "@/lib/action";
import { adminAudit, requireAdminAction } from "@/lib/admin";
import { db } from "@/lib/db";

const refresh = () => {
  revalidatePath("/admin/messages");
  revalidatePath("/admin");
};

export async function adminMarkMessage(id: string, read: boolean): Promise<ActionResult> {
  return run(async () => {
    await requireAdminAction("messages.view");
    await db.contactMessage.updateMany({ where: { id }, data: { readAt: read ? new Date() : null } });
    refresh();
    return ok(undefined);
  });
}

export async function adminDeleteMessage(id: string): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("messages.view");
    const m = await db.contactMessage.findUnique({ where: { id }, select: { email: true } });
    await db.contactMessage.deleteMany({ where: { id } });
    await adminAudit(admin, "message.delete", "contact_message", id, { email: m?.email ?? null });
    refresh();
    return ok(undefined, "Message deleted");
  });
}
