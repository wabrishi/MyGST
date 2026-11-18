import { fromPaise } from "../gst/calc";

/** Line items as they appear in event payloads (rupees), e.g. for inventory or accounting plugins. */
export interface EventItem {
  productId: string | null;
  description: string;
  hsnSac: string;
  qty: number;
  unit: string;
  rate: number;
  gstRate: number;
  taxable: number;
}

/** From calcDocument() lines (taxable in paise). */
export function eventItems(
  lines: Array<{ productId?: string | null; description: string; hsnSac?: string; qty: number; unit?: string; rate: number; gstRate: number; taxable: number }>,
): EventItem[] {
  return lines.map((l) => ({
    productId: l.productId || null,
    description: l.description,
    hsnSac: l.hsnSac ?? "",
    qty: l.qty,
    unit: (l.unit ?? "NOS").toUpperCase(),
    rate: l.rate,
    gstRate: l.gstRate,
    taxable: fromPaise(l.taxable),
  }));
}
