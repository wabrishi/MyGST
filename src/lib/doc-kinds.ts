import type { DocType } from "@/generated/prisma/enums";

/** URL slug <-> document type. Shared by server and client. */
export const DOC_KINDS = {
  invoices: { type: "INVOICE", title: "Invoices", singular: "Invoice", printTitle: "TAX INVOICE" },
  quotations: { type: "QUOTATION", title: "Quotations", singular: "Quotation", printTitle: "QUOTATION" },
  "credit-notes": { type: "CREDIT_NOTE", title: "Credit notes", singular: "Credit note", printTitle: "CREDIT NOTE" },
  "debit-notes": { type: "DEBIT_NOTE", title: "Debit notes", singular: "Debit note", printTitle: "DEBIT NOTE" },
} as const satisfies Record<string, { type: DocType; title: string; singular: string; printTitle: string }>;

export type DocKind = keyof typeof DOC_KINDS;

export const isDocKind = (s: string): s is DocKind => s in DOC_KINDS;

export const kindOfType = (t: DocType): DocKind =>
  (Object.keys(DOC_KINDS) as DocKind[]).find((k) => DOC_KINDS[k].type === t)!;

export const isNote = (t: DocType) => t === "CREDIT_NOTE" || t === "DEBIT_NOTE";

/** Reasons accepted by the GST portal for credit/debit notes. */
export const NOTE_REASONS = [
  "Sales Return",
  "Post Sale Discount",
  "Deficiency in services",
  "Correction in Invoice",
  "Change in POS",
  "Finalization of Provisional assessment",
  "Others",
] as const;
