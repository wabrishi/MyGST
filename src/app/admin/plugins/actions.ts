"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { adminAudit, requireAdminAction } from "@/lib/admin";
import { addExternalPlugin, installPlugin, previewUpload, saveUpload, setAvailability, setCompanyAccess, syncCodePlugins, uninstallPlugin, type UploadPreview } from "@/lib/plugins/manage";
import { MAX_BUNDLE_BYTES } from "@/lib/plugins/uploaded";

const availability = z.enum(["ALL", "SELECTED", "NONE"]);
const refresh = (pluginId?: string) => {
  revalidatePath("/admin/plugins");
  if (pluginId) revalidatePath(`/admin/plugins/${pluginId}`);
  revalidatePath("/c", "layout");
};
const changed = (n: number) => (n ? ` ${n} compan${n === 1 ? "y" : "ies"} affected.` : "");

export async function adminInstallPlugin(pluginId: string, input: { availability: string; defaultEnabled: boolean }): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("plugins.manage");
    const opts = { availability: availability.parse(input.availability), defaultEnabled: !!input.defaultEnabled };
    const n = await installPlugin(pluginId, { ...opts, by: admin.user.email });
    await adminAudit(admin, "plugin.install", "plugin", pluginId, opts);
    refresh(pluginId);
    return ok(undefined, `Plugin installed.${changed(n)}`);
  });
}

export async function adminSetAvailability(pluginId: string, input: { availability?: string; defaultEnabled?: boolean }): Promise<ActionResult> {
  return run(async () => {
    const admin = await requireAdminAction("plugins.manage");
    await adminAudit(admin, "plugin.availability", "plugin", pluginId, { availability: input.availability ?? null, defaultEnabled: input.defaultEnabled ?? null });
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
    const admin = await requireAdminAction("plugins.manage");
    await adminAudit(admin, "plugin.company_access", "plugin", pluginId, { companyId, ...access });
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
    const admin = await requireAdminAction("plugins.manage");
    await adminAudit(admin, "plugin.uninstall", "plugin", pluginId, { keepData: !!keepData });
    await uninstallPlugin(pluginId, { keepData: !!keepData });
    refresh(pluginId);
    return ok(undefined, "Plugin uninstalled");
  });
}

export async function adminAddExternalPlugin(url: string): Promise<ActionResult<{ id: string; permissionsAdded: string[] }>> {
  return run(async () => {
    const admin = await requireAdminAction("plugins.manage");
    const r = await addExternalPlugin(z.string().trim().url("Enter the manifest URL").parse(url));
    await adminAudit(admin, "plugin.add_external", "plugin", r.id, { url });
    refresh(r.id);
    return ok(r, "Manifest loaded");
  });
}

export async function adminRescanPlugins(): Promise<ActionResult> {
  return run(async () => {
    await requireAdminAction("plugins.manage");
    const { broken } = await syncCodePlugins();
    refresh();
    return ok(undefined, broken.length ? `${broken.length} plugin(s) failed to load` : "Plugins rescanned");
  });
}

async function bundleText(form: FormData) {
  const file = form.get("bundle");
  if (!(file instanceof File) || !file.size) throw new UserError("Choose a .mygst-plugin.js file");
  if (file.size > MAX_BUNDLE_BYTES) throw new UserError("The file is larger than 2 MB");
  if (!/\.js$/i.test(file.name)) throw new UserError("Upload the .mygst-plugin.js file made by npm run plugin:pack");
  return file.text();
}

/** Step 1: validate the uploaded bundle and show what it is (nothing is saved). */
export async function adminPreviewUpload(form: FormData): Promise<ActionResult<UploadPreview>> {
  return run(async () => {
    await requireAdminAction("plugins.upload");
    return ok(await previewUpload(await bundleText(form)));
  });
}

/** Step 2: save it (the admin confirmed the id, version, permissions and checksum). */
export async function adminConfirmUpload(form: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const admin = await requireAdminAction("plugins.upload");
    const preview = await saveUpload(await bundleText(form), {
      by: admin.user.email,
      expectSha256: String(form.get("sha256") ?? ""),
      allowDowngrade: form.get("allowDowngrade") === "on",
    });
    await adminAudit(admin, preview.existingVersion ? "plugin.upload_update" : "plugin.upload", "plugin", preview.id, { version: preview.version, sha256: preview.sha256 });
    refresh(preview.id);
    return ok({ id: preview.id }, preview.existingVersion ? `Updated to v${preview.version}` : "Plugin uploaded");
  });
}
