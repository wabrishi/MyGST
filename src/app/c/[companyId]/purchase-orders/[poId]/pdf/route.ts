import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { purchaseOrderPdfFor } from "@/lib/pdf/purchase-order-pdf";
import { loadPurchaseOrder } from "@/lib/purchase-orders";
import { requireCompany } from "@/lib/tenant";

export async function GET(request: Request, { params }: RouteContext<"/c/[companyId]/purchase-orders/[poId]/pdf">) {
  const { companyId, poId } = await params;
  const ctx = await requireCompany(companyId);
  if (!can(ctx, "purchaseOrders.view")) notFound();
  const po = await loadPurchaseOrder(ctx.companyId, poId);
  if (!po) notFound();
  const company = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
  let pdf: Buffer;
  try {
    pdf = await purchaseOrderPdfFor(po, company);
  } catch (err) {
    console.error(`[pdf] PO ${po.number} failed:`, err);
    const reason = err instanceof Error ? err.message.split("\n")[0].slice(0, 200) : "unknown error";
    return new Response(`Could not generate the PDF.\n\nReason: ${reason}`, { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${po.number.replace(/[^A-Za-z0-9-]/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
