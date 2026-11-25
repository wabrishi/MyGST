import "server-only";
import type { LoadedDocument } from "../documents";
import { renderDocumentPdf } from "./document-pdf";

/** A made-up invoice, attached to test emails of templates that normally carry a document PDF. */
export function sampleInvoice(): LoadedDocument {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: "sample",
    type: "INVOICE",
    number: "INV/26-27/0042",
    fy: "2026-27",
    date: today,
    dueDate: today,
    status: "ISSUED",
    partyId: "sample",
    partyName: "Blue Ocean Pvt Ltd",
    partyGstin: "29ABCDE1234F1Z5",
    partyAddress: "12 MG Road, Bengaluru 560001",
    partyState: "29",
    shippingAddress: "",
    seller: {
      legalName: "Sharma Traders",
      tradeName: "Sharma Traders",
      gstin: "27AAAPL1234C1Z5",
      address: "4 Market Lane",
      city: "Pune",
      pincode: "411001",
      stateCode: "27",
      phone: "+91 98765 43210",
      email: "accounts@example.com",
      bankName: "Sample Bank",
      bankAccount: "1234567890",
      bankIfsc: "SBIN0000001",
      bankBranch: "Pune",
      upiId: "",
      terms: "This is a sample invoice attached to a test email.",
    },
    placeOfSupply: "29",
    isInterstate: true,
    reverseCharge: false,
    pricesIncludeTax: false,
    taxable: 565000,
    cgst: 0,
    sgst: 0,
    igst: 101700,
    roundOff: 0,
    grandTotal: 666700,
    paid: 0,
    credited: 0,
    balance: 666700,
    originalDoc: null,
    convertedToId: null,
    noteReason: "",
    notes: "",
    customFields: {},
    createdById: "sample",
    createdAt: new Date(),
    payments: [],
    notesIssued: [],
    items: [
      { productId: null, description: "Office chair", hsnSac: "9401", unit: "NOS", qty: 1, rate: 4000, discountPct: 0, gstRate: 18, taxable: 400000, cgst: 0, sgst: 0, igst: 72000, total: 472000 },
      { productId: null, description: "Desk lamp", hsnSac: "9405", unit: "NOS", qty: 1, rate: 1650, discountPct: 0, gstRate: 18, taxable: 165000, cgst: 0, sgst: 0, igst: 29700, total: 194700 },
    ],
  };
}

export const samplePdfAttachment = async () => ({
  filename: "Sample-INV_26-27_0042.pdf",
  content: await renderDocumentPdf(sampleInvoice(), null),
  contentType: "application/pdf",
});
