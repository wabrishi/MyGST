import "server-only";
import { canPlugin, type BuiltinRoleKey } from "../permissions";
import { UserError } from "../user-error";
import { safeCompanyPath, sameOrigin, withNotice } from "./action-helpers";
import { recordFailure, withTimeout } from "./log";
import type { CodePlugin } from "./registry";
import { ACTION_TIMEOUT_MS, contextFor, type PluginEntry } from "./runner";

/**
 * Plugin form actions (api.action): an <ActionForm> posts here, the handler runs with the member's
 * context, and the browser is sent back (303) to the page with ?_ok=<message> or ?_error=<message>.
 * Works without JavaScript, so it also works for uploaded plugins (which can't ship client components).
 */

interface RunInput {
  code: CodePlugin;
  entry: PluginEntry;
  companyId: string;
  user: { id: string; name: string; email: string };
  grants: { roles: Array<{ key: string | null }>; permissions: ReadonlySet<string>; role: BuiltinRoleKey | null };
  name: string;
}

const back = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

export async function runFormAction(request: Request, input: RunInput): Promise<Response> {
  const { code, entry, companyId, user, grants, name } = input;
  const pluginId = entry.plugin.id;
  if (!sameOrigin(request)) return Response.json({ error: "Cross-site form posts are not allowed" }, { status: 403 });
  const action = code.formActions.get(name);
  if (!action) return Response.json({ error: "Not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a form" }, { status: 400 });
  }
  const fallback = `/c/${companyId}/apps/${pluginId}`;
  const returnTo = safeCompanyPath(companyId, form.get("_returnTo")) ?? safeCompanyPath(companyId, request.headers.get("referer")) ?? fallback;
  form.delete("_returnTo");

  if (action.permission && !canPlugin(grants, pluginId, entry.manifest.capabilities, action.permission)) {
    return back(withNotice(returnTo, "_error", "You don't have permission to do that"));
  }
  try {
    const ctx = await contextFor(entry, companyId, user, grants.role, grants);
    const result = await withTimeout(Promise.resolve(action.handler(form, ctx)), ACTION_TIMEOUT_MS, `action ${name}`);
    const target = (result && safeCompanyPath(companyId, result.redirect)) || returnTo;
    return back(withNotice(target, "_ok", (result && typeof result.message === "string" && result.message) || ""));
  } catch (e) {
    if (e instanceof UserError) return back(withNotice(returnTo, "_error", e.message));
    await recordFailure(pluginId, companyId, `action ${name}`, e);
    return back(withNotice(returnTo, "_error", "Something went wrong. The error was logged for the plugin's developer."));
  }
}
