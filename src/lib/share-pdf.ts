import "server-only";
import type { Company, SharedKind } from "@/generated/prisma/client";
import { loadDocument } from "./documents";
import { renderDocumentPdf } from "./pdf/document-pdf";
import { purchaseOrderPdfFor } from "./pdf/purchase-order-pdf";
import { loadPurchaseOrder } from "./purchase-orders";

/**
 * The sender's own PDF of a shared document (null if the source is gone). Callers must have checked
 * that the share is addressed to the company asking for it.
 */
export async function sharedDocumentPdf(share: { kind: SharedKind; sourceId: string; fromCompanyId: string }, sender: Company): Promise<Buffer | null> {
  if (share.kind === "PURCHASE_ORDER") {
    const po = await loadPurchaseOrder(share.fromCompanyId, share.sourceId);
    return po ? purchaseOrderPdfFor(po, sender) : null;
  }
  const doc = await loadDocument(share.fromCompanyId, share.sourceId);
  if (!doc) return null;
  const logo = sender.logo && sender.logoMime !== "image/webp" ? { data: Buffer.from(sender.logo), mime: sender.logoMime ?? "image/png" } : null;
  return renderDocumentPdf(doc, logo).catch(() => renderDocumentPdf(doc, null));
}

export const pdfFileName = (number: string) => `${number.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`;
