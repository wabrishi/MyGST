"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ok, run, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { formatPaise } from "@/lib/gst/calc";
import { escapeHtml, mailEnabled, sendMail } from "@/lib/mail";
import { purchaseOrderPdfFor } from "@/lib/pdf/purchase-order-pdf";
import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  loadPurchaseOrder,
  reopenPurchaseOrder,
  savePurchaseOrder,
  type PurchaseOrderInput,
} from "@/lib/purchase-orders";
import { requireCompany } from "@/lib/tenant";

export async function savePO(companyId: string, id: string | null, input: PurchaseOrderInput): Promise<ActionResult<{ id: string }>> {
  const res = await run(async () => {
    const ctx = await requireCompany(companyId, "purchaseOrders.write");
    const poId = await savePurchaseOrder(ctx, id, input);
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok({ id: poId });
  });
  if (res.ok) redirect(`/c/${companyId}/purchase-orders/${res.data.id}`);
  return res;
}

export async function changePOStatus(companyId: string, id: string, action: "cancel" | "close" | "reopen"): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "purchaseOrders.write");
    if (action === "cancel") await cancelPurchaseOrder(ctx, id);
    else if (action === "close") await closePurchaseOrder(ctx, id);
    else if (action === "reopen") await reopenPurchaseOrder(ctx, id);
    else throw new UserError("Unknown action");
    revalidatePath(`/c/${ctx.companyId}`, "layout");
    return ok(undefined, { cancel: "Purchase order cancelled", close: "Purchase order closed", reopen: "Purchase order reopened" }[action]);
  });
}

/** Emails the PO PDF to the supplier (or any address). */
export async function emailPO(companyId: string, id: string, to: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompany(companyId, "purchaseOrders.write");
    const email = z.email("Enter a valid email").parse(String(to ?? "").trim());
    const po = await loadPurchaseOrder(ctx.companyId, id);
    if (!po) throw new UserError("Purchase order not found");
    if (po.status === "CANCELLED") throw new UserError("Cancelled orders can't be emailed");
    const company = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
    const pdf = await purchaseOrderPdfFor(po, company);
    const from = company.tradeName || company.legalName;
    await sendMail({
      to: email,
      subject: `Purchase Order ${po.number} from ${from}`,
      html: `<p>Dear ${escapeHtml(po.partyName)},</p><p>Please find attached our purchase order <b>${escapeHtml(po.number)}</b> dated ${po.date} for <b>₹${formatPaise(po.grandTotal)}</b>${
        po.expectedDate ? `, to be delivered by <b>${po.expectedDate}</b>` : ""
      }.</p><p>Please quote the PO number on your invoice.</p><p>Regards,<br>${escapeHtml(from)}</p>`,
      attachments: [{ filename: `${po.number.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    await audit(ctx, "email", "purchase_order", id, { to: email });
    return ok(undefined, mailEnabled() ? `Sent to ${email}` : "Email not configured — logged to server console");
  });
}
