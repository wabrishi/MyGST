"use server";

import { revalidatePath } from "next/cache";
import { ok, run, type ActionResult } from "@/lib/action";
import { adminAudit, requireAdminAction } from "@/lib/admin";
import type { NavLayout } from "@/lib/nav";
import { resetNavLayout, saveNavLayout } from "@/lib/nav-store";

const refresh = () => {
  revalidatePath("/admin/menu");
  revalidatePath("/c", "layout"); // every company's sidebar
};

/** Saves the sidebar order for every company. */
export async function adminSaveNavLayout(layout: NavLayout): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("menu.manage");
    const saved = await saveNavLayout(layout);
    await adminAudit(admin, "menu.update", "menu", null, { sections: saved.sections });
    refresh();
    return ok(undefined, "Menu order saved for every company");
  });
}

/** Back to the built-in order. */
export async function adminResetNavLayout(): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("menu.manage");
    await resetNavLayout();
    await adminAudit(admin, "menu.reset", "menu", null);
    refresh();
    return ok(undefined, "Menu reset to the default order");
  });
}
