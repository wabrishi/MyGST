"use server";

import { revalidatePath } from "next/cache";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { fyRange, setSelectedFy } from "@/lib/fy-context";
import { financialYear, todayIST } from "@/lib/gst/fy";
import { requireCompany } from "@/lib/tenant";

export async function chooseFy(companyId: string, fy: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId);
    await setSelectedFy(ctx.companyId, fy);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok(undefined);
  });
}

/** Closes books up to the end of `fy` (also closes all earlier years). */
export async function closeFy(companyId: string, fy: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    const [, end] = fyRange(fy);
    if (fy === financialYear(todayIST())) throw new UserError("The current financial year can't be closed until it ends");
    await db.company.update({ where: { id: ctx.companyId }, data: { lockedUntil: new Date(end + "T00:00:00Z") } });
    await audit(ctx, "close", "financial_year", fy);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok(undefined, `FY 20${fy} closed`);
  });
}

/** Re-opens `fy` (and any later closed years): lock moves back to the end of the previous FY. */
export async function reopenFy(companyId: string, fy: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    const [start] = fyRange(fy);
    const prevEnd = new Date(new Date(start + "T00:00:00Z").getTime() - 86_400_000);
    const company = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { lockedUntil: true } });
    if (!company.lockedUntil || company.lockedUntil < prevEnd) return ok(undefined);
    await db.company.update({ where: { id: ctx.companyId }, data: { lockedUntil: prevEnd } });
    await audit(ctx, "reopen", "financial_year", fy);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok(undefined, `FY 20${fy} re-opened`);
  });
}
