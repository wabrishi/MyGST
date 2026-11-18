/** Old download link: moved to /admin/plugins/<id>/download (super admins only). */
export async function GET(request: Request, { params }: RouteContext<"/admin/plugins/[pluginId]/bundle">) {
  const { pluginId } = await params;
  return Response.redirect(new URL(`/admin/plugins/${encodeURIComponent(pluginId)}/download`, request.url), 308);
}
