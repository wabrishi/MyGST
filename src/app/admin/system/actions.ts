"use server";

import { revalidatePath } from "next/cache";
import { ok, run, type ActionResult } from "@/lib/action";
import { adminAudit, requireAdminAction } from "@/lib/admin";
import { db } from "@/lib/db";
import { deliverPending } from "@/lib/events/outbox";

/** Re-queues every failed (DEAD) event on the platform and tries to deliver now. */
export async function adminRetryFailedEvents(): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("system.view");
    const r = await db.outboxEvent.updateMany({ where: { status: "DEAD" }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date() } });
    const sent = await deliverPending({ limit: 100 });
    await adminAudit(admin, "system.retry_events", "outbox", null, { requeued: r.count, delivered: sent.sent });
    revalidatePath("/admin/system");
    return ok(undefined, `${r.count} re-queued · ${sent.sent} delivered`);
  });
}
