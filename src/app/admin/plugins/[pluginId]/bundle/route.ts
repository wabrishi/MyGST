import { adminGrants } from "@/lib/admin";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Downloads an uploaded plugin's stored bundle (admins with plugins.upload). */
export async function GET(_request: Request, { params }: RouteContext<"/admin/plugins/[pluginId]/bundle">) {
  const user = await getSessionUser();
  if (!user || !(await adminGrants(user.id, user.email)).permissions.has("plugins.upload")) return new Response("Not found", { status: 404 });
  const { pluginId } = await params;
  const p = await db.plugin.findUnique({ where: { id: pluginId }, select: { id: true, version: true, kind: true, bundle: true } });
  if (!p || p.kind !== "UPLOADED" || !p.bundle) return new Response("Not found", { status: 404 });
  return new Response(p.bundle, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Content-Disposition": `attachment; filename="${p.id}-${p.version}.mygst-plugin.js"`,
      "Cache-Control": "no-store",
    },
  });
}
