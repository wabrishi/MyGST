"use server";

import { revalidatePath } from "next/cache";
import { ok, run, type ActionResult } from "@/lib/action";
import { adminAudit, isSuperAdmin, requireAdminAction } from "@/lib/admin";
import { db } from "@/lib/db";
import { deliverPending } from "@/lib/events/outbox";
import { rememberMigrationRun, runMigrations } from "@/lib/migrate";
import { UserError } from "@/lib/user-error";

/** Applies pending database migrations now (super admins), e.g. after fixing a failed one. */
export async function adminApplyMigrations(): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("system.view");
    if (!isSuperAdmin(admin)) throw new UserError("Only super admins can apply migrations");
    const r = await runMigrations();
    rememberMigrationRun(r);
    await adminAudit(admin, "system.migrate", "database", null, { applied: r.applied, error: r.error ?? null });
    revalidatePath("/admin/system");
    if (!r.ok) throw new UserError(r.error ?? "Migrations failed");
    return ok(undefined, r.applied.length ? `Applied ${r.applied.join(", ")}` : "Already up to date");
  });
}

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
