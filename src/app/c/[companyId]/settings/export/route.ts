import { companyExportJson } from "@/lib/backup/export";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/gst/fy";
import { ForbiddenError, requireCompany } from "@/lib/tenant";

/** Owner-only full JSON export of the company's data (manual backup / migration). */
export async function GET(_req: Request, { params }: RouteContext<"/c/[companyId]/settings/export">) {
  const { companyId } = await params;
  let ctx;
  try {
    ctx = await requireCompany(companyId, "company.settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw e;
  }
  const body = await companyExportJson(ctx.companyId);
  await db.auditLog.create({ data: { companyId: ctx.companyId, userId: ctx.user.id, action: "export", entity: "company", entityId: ctx.companyId } });
  const name = (ctx.company.tradeName || ctx.company.legalName).replace(/[^A-Za-z0-9]+/g, "_");
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}_backup_${todayIST()}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
