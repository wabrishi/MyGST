"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { reconnectExternal, saveCompanySettings, setCompanyEnabled } from "@/lib/plugins/manage";
import { requireCompany } from "@/lib/tenant";

const pluginId = z.string().regex(/^[a-z][a-z0-9-]{1,40}[a-z0-9]$/);

export async function ownerSetPluginEnabled(companyId: string, id: string, enabled: boolean): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    await setCompanyEnabled(pluginId.parse(id), ctx.companyId, !!enabled, ctx.user.id);
    await audit(ctx, enabled ? "enable" : "disable", "plugin", id);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok(undefined, enabled ? "Plugin turned on" : "Plugin turned off");
  });
}

export async function ownerSavePluginSettings(companyId: string, id: string, values: Record<string, unknown>, clearSecrets: string[] = []): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    await saveCompanySettings(pluginId.parse(id), ctx.companyId, values, clearSecrets);
    await audit(ctx, "update", "plugin_settings", id);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok(undefined, "Settings saved");
  });
}

export async function ownerReconnectPlugin(companyId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "company.settings");
    await reconnectExternal(pluginId.parse(id), ctx.companyId);
    await audit(ctx, "reconnect", "plugin", id);
    return ok(undefined, "Reconnected: a new key and secret were sent to the plugin");
  });
}
