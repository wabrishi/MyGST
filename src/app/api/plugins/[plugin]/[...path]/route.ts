import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pluginLog } from "@/lib/plugins/log";
import { activeEntries, contextFor, type PluginEntry } from "@/lib/plugins/runner";
import { codePlugin } from "@/lib/plugins/registry";

/**
 * HTTP routes registered by code plugins with api.route(): /api/plugins/<plugin>/<path>
 * - Signed-in routes need ?companyId=<id>; the caller must be a member there (and have one of `roles`),
 *   and the plugin must be active for that company.
 * - Public routes (opts.public) get no user; they can look up a company context with helpers.contextFor().
 * A route path ending in "/*" matches anything below it.
 */
async function dispatch(request: Request, { params }: RouteContext<"/api/plugins/[plugin]/[...path]">) {
  const { plugin, path } = await params;
  const code = codePlugin(plugin);
  if (!code) return Response.json({ error: "Not found" }, { status: 404 });
  const joined = path.join("/");
  const route = code.routes.find((r) => r.method === request.method && (r.path === joined || (r.path.endsWith("/*") && joined.startsWith(r.path.slice(0, -1)))));
  if (!route) return Response.json({ error: "Not found" }, { status: 404 });

  const findEntry = async (companyId: string): Promise<PluginEntry | null> => (await activeEntries(companyId)).find((e) => e.plugin.id === plugin) ?? null;
  const contextFor_ = async (companyId: string) => {
    const e = await findEntry(companyId);
    return e ? contextFor(e, companyId) : null;
  };

  let ctx = null;
  if (!route.public) {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
    const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
    const m = companyId ? await db.membership.findUnique({ where: { userId_companyId: { userId: user.id, companyId } }, include: { company: { select: { suspendedAt: true } } } }) : null;
    if (!m || m.company.suspendedAt) return Response.json({ error: "Not found" }, { status: 404 });
    if (route.roles && !route.roles.includes(m.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
    const e = await findEntry(companyId);
    if (!e) return Response.json({ error: "Plugin is not active for this company" }, { status: 404 });
    ctx = await contextFor(e, companyId, user, m.role);
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
