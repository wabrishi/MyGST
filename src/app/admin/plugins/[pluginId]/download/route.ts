import { adminAudit, adminGrants, isSuperAdmin } from "@/lib/admin";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { builtInBundle } from "@/lib/plugins/packed";
import { bundleSha256 } from "@/lib/plugins/uploaded";

/**
 * Super admins only: download a plugin to keep a copy or move it to another MyGST.
 * - Uploaded: the stored bundle. Built-in: the bundle packed from src/plugins at build time.
 *   Both upload again through Admin → Plugins → Upload a plugin.
 * - External: its manifest.json (load it on another MyGST by URL, or host it yourself).
 */
export async function GET(_request: Request, { params }: RouteContext<"/admin/plugins/[pluginId]/download">) {
  const user = await getSessionUser();
  const grants = user ? await adminGrants(user.id, user.email) : null;
  if (!user || !grants || !isSuperAdmin(grants)) return new Response("Not found", { status: 404 });
  const { pluginId } = await params;
  const p = await db.plugin.findUnique({ where: { id: pluginId }, select: { id: true, version: true, kind: true, bundle: true, manifest: true } });
  if (!p) return new Response("Not found", { status: 404 });

  let body: string;
  let filename: string;
  let type: string;
  if (p.kind === "EXTERNAL") {
    body = JSON.stringify(p.manifest, null, 2) + "\n";
    filename = `${p.id}-${p.version}.manifest.json`;
    type = "application/json; charset=utf-8";
  } else {
    const code = p.kind === "UPLOADED" ? p.bundle : await builtInBundle(p.id, p.version);
    if (!code) return new Response("This plugin hasn't been packed yet. Run npm run plugin:pack -- --all (the build does this) and try again.", { status: 404 });
    body = code;
    filename = `${p.id}-${p.version}.mygst-plugin.js`;
    type = "text/javascript; charset=utf-8";
  }
  const sha = bundleSha256(body);
  await adminAudit({ user }, "plugin.download", "plugin", p.id, { version: p.version, kind: p.kind, sha256: sha });
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Checksum-SHA256": sha,
      "Cache-Control": "no-store",
    },
  });
}
