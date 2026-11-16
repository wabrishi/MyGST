"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, run, type ActionResult } from "@/lib/action";
import { requireSuperAdmin } from "@/lib/admin";
import { addExternalPlugin, installPlugin, setAvailability, setCompanyAccess, syncCodePlugins, uninstallPlugin } from "@/lib/plugins/manage";

const availability = z.enum(["ALL", "SELECTED", "NONE"]);
const refresh = (pluginId?: string) => {
  revalidatePath("/admin/plugins");
  if (pluginId) revalidatePath(`/admin/plugins/${pluginId}`);
  revalidatePath("/c", "layout");
};
const changed = (n: number) => (n ? ` ${n} compan${n === 1 ? "y" : "ies"} affected.` : "");

export async function adminInstallPlugin(pluginId: string, input: { availability: string; defaultEnabled: boolean }): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireSuperAdmin();
    const n = await installPlugin(pluginId, { availability: availability.parse(input.availability), defaultEnabled: !!input.defaultEnabled, by: admin.email });
    refresh(pluginId);
    return ok(undefined, `Plugin installed.${changed(n)}`);
  });
}

export async function adminSetAvailability(pluginId: string, input: { availability?: string; defaultEnabled?: boolean }): Promise<ActionResult> {
  return run(async () => {
    await requireSuperAdmin();
    const n = await setAvailability(pluginId, {
      availability: input.availability ? availability.parse(input.availability) : undefined,
      defaultEnabled: input.defaultEnabled,
    });
    refresh(pluginId);
    return ok(undefined, `Saved.${changed(n)}`);
  });
}

export async function adminSetCompanyAccess(pluginId: string, companyId: string, access: { allowed?: boolean; blocked?: boolean }): Promise<ActionResult> {
  return run(async () => {
    await requireSuperAdmin();
    await setCompanyAccess(pluginId, z.string().min(1).parse(companyId), {
      ...(access.allowed !== undefined && { allowed: !!access.allowed }),
      ...(access.blocked !== undefined && { blocked: !!access.blocked }),
    });
    refresh(pluginId);
    revalidatePath(`/admin/companies/${companyId}`);
    return ok(undefined);
  });
}

export async function adminUninstallPlugin(pluginId: string, keepData: boolean): Promise<ActionResult> {
  return run(async () => {
    await requireSuperAdmin();
    await uninstallPlugin(pluginId, { keepData: !!keepData });
    refresh(pluginId);
    return ok(undefined, "Plugin uninstalled");
  });
}

export async function adminAddExternalPlugin(url: string): Promise<ActionResult<{ id: string; permissionsAdded: string[] }>> {
  return run(async () => {
    await requireSuperAdmin();
    const r = await addExternalPlugin(z.string().trim().url("Enter the manifest URL").parse(url));
    refresh(r.id);
    return ok(r, "Manifest loaded");
  });
}

export async function adminRescanPlugins(): Promise<ActionResult> {
  return run(async () => {
    await requireSuperAdmin();
    const { broken } = await syncCodePlugins();
    refresh();
    return ok(undefined, broken.length ? `${broken.length} plugin(s) failed to load` : "Plugins rescanned");
  });
}
