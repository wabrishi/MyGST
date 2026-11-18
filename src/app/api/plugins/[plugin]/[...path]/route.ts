import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canPlugin, canUseApp } from "@/lib/permissions";
import { runFormAction } from "@/lib/plugins/actions";
import { pluginLog } from "@/lib/plugins/log";
import { activeEntries, contextFor, type PluginEntry } from "@/lib/plugins/runner";
import { codeFor } from "@/lib/plugins/uploaded";
import { memberGrants, ROLES_SELECT } from "@/lib/tenant";

/**
 * HTTP routes registered by code plugins with api.route(): /api/plugins/<plugin>/<path>
 * - Signed-in routes need ?companyId=<id>; the caller must be a member there (and have one of `roles`
 *   and the route's capability), and the plugin must be active for that company.
 * - Public routes (opts.public) get no user; they can look up a company context with helpers.contextFor().
 * A route path ending in "/*" matches anything below it.
 * Form actions (api.action) are posted to /api/plugins/<plugin>/_action/<name>?companyId=<id>.
 */
async function dispatch(request: Request, { params }: RouteContext<"/api/plugins/[plugin]/[...path]">) {
  const { plugin, path } = await params;
  const row = await db.plugin.findUnique({ where: { id: plugin }, select: { id: true, kind: true, bundleSha256: true } });
  const code = row && row.kind !== "EXTERNAL" ? await codeFor(row) : null;
  if (!code) return Response.json({ error: "Not found" }, { status: 404 });

  const findEntry = async (companyId: string): Promise<PluginEntry | null> => (await activeEntries(companyId)).find((e) => e.plugin.id === plugin) ?? null;

  // Signed-in member of ?companyId with the plugin active there.
  const signedIn = async () => {
    const user = await getSessionUser();
    if (!user) return { error: Response.json({ error: "Sign in required" }, { status: 401 }) };
    const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
    const m = companyId ? await db.membership.findUnique({ where: { userId_companyId: { userId: user.id, companyId } }, include: { company: { select: { suspendedAt: true } }, ...ROLES_SELECT } }) : null;
    if (!m || m.company.suspendedAt) return { error: Response.json({ error: "Not found" }, { status: 404 }) };
    const e = await findEntry(companyId);
    if (!e) return { error: Response.json({ error: "Plugin is not active for this company" }, { status: 404 }) };
    return { user, companyId, grants: memberGrants(m.roles), entry: e };
  };

  if (path[0] === "_action" && path.length === 2) {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const s = await signedIn();
    if ("error" in s) return s.error;
    return runFormAction(request, { code, entry: s.entry, companyId: s.companyId, user: s.user, grants: s.grants, name: path[1] });
  }

  const joined = path.join("/");
  const route = code.routes.find((r) => r.method === request.method && (r.path === joined || (r.path.endsWith("/*") && joined.startsWith(r.path.slice(0, -1)))));
  if (!route) return Response.json({ error: "Not found" }, { status: 404 });

  const contextFor_ = async (companyId: string) => {
    const e = await findEntry(companyId);
    return e ? contextFor(e, companyId) : null;
  };

  let ctx = null;
  if (!route.public) {
    const s = await signedIn();
    if ("error" in s) return s.error;
    if (route.roles && !canUseApp(s.grants, plugin, route.roles)) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (route.permission && !canPlugin(s.grants, plugin, s.entry.manifest.capabilities, route.permission)) return Response.json({ error: "Forbidden" }, { status: 403 });
    ctx = await contextFor(s.entry, s.companyId, s.user, s.grants.role, s.grants);
  }

  try {
    return await route.handler(request, { ctx, path: path.slice(route.path.split("/").length - (route.path.endsWith("/*") ? 1 : 0)), contextFor: contextFor_ });
  } catch (e) {
    await pluginLog(plugin, ctx?.companyId ?? null, "error", `route ${request.method} ${joined}: ${(e as Error).message}`);
    return Response.json({ error: "Plugin error" }, { status: 500 });
  }
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
