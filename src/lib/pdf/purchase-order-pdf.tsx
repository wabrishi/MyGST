import "server-only";
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { taxSummary } from "../gst/calc";
import { sgstLabel, stateName } from "../gst/states";
import { paiseToWords } from "../gst/words";
import type { LoadedPurchaseOrder } from "../purchase-orders";
import { BORDER, KV, PDF_FONTS, amt, dmy, pdfStyles as s } from "./document-pdf";

/** Our company, as the buyer at the top of the order. */
export interface PoBuyer {
  legalName: string;
  tradeName: string;
  gstin: string;
  address: string;
  city: string;
  pincode: string;
  stateCode: string;
  phone: string;
  email: string;
}

/** A4 purchase order: same look as sales documents, with SUPPLIER and DELIVER TO boxes. */
export function PurchaseOrderPdf({ po, buyer, logo }: { po: LoadedPurchaseOrder; buyer: PoBuyer; logo: { data: Buffer; mime: string } | null }) {
  const inter = po.isInterstate;
  const sLabel = sgstLabel(po.placeOfSupply);
  const summary = taxSummary(po.items);
  const cols = inter
    ? { n: 4, desc: 32, hsn: 9, qty: 10, rate: 11, disc: 6, taxable: 12, gst: 6, tax: 11, total: 12 }
    : { n: 4, desc: 28, hsn: 9, qty: 10, rate: 10, disc: 5, taxable: 11, gst: 5, cgst: 9, sgst: 9, total: 11 };
  const W = (k: keyof typeof cols) => ({ flex: cols[k] as number });

  return (
    <Document title={`Purchase Order ${po.number}`} author={buyer.legalName} creator="MyGST">
      <Page size="A4" style={s.page}>
        {po.status === "CANCELLED" && <Text style={s.watermark}>CANCELLED</Text>}
        <Text style={s.title}>PURCHASE ORDER</Text>

        <View style={[s.box, s.row, { marginTop: 8 }]}>
          <View style={[s.cell, { flex: 1.3, borderRightWidth: 1, borderColor: BORDER }]}>
            <View style={s.row}>
              {logo && (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={{ data: logo.data, format: logo.mime === "image/png" ? "png" : "jpg" }} style={{ width: 60, height: 40, objectFit: "contain", marginRight: 8 }} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.big}>{buyer.tradeName || buyer.legalName}</Text>
                {buyer.tradeName && buyer.tradeName !== buyer.legalName && <Text>{buyer.legalName}</Text>}
                <Text>{[buyer.address, buyer.city, buyer.pincode].filter(Boolean).join(", ")}</Text>
                <Text>
                  State: {stateName(buyer.stateCode)} ({buyer.stateCode})
                </Text>
                {buyer.gstin ? <Text style={s.bold}>GSTIN: {buyer.gstin}</Text> : <Text>Unregistered</Text>}
                {(buyer.phone || buyer.email) && <Text>{[buyer.phone, buyer.email].filter(Boolean).join(" · ")}</Text>}
              </View>
            </View>
          </View>
          <View style={[s.cell, { flex: 1 }]}>
            <KV k="PO No." v={po.number} />
            <KV k="PO date" v={dmy(po.date)} />
            <KV k="Deliver by" v={dmy(po.expectedDate)} />
            <KV k="Place of supply" v={`${stateName(po.placeOfSupply)} (${po.placeOfSupply})`} />
            <KV k="Payment terms" v={po.paymentTerms} />
          </View>
        </View>

        <View style={[s.box, s.row, { borderTopWidth: 0 }]}>
          <View style={[s.cell, { flex: 1, borderRightWidth: 1, borderColor: BORDER }]}>
            <Text style={s.label}>SUPPLIER</Text>
            <Text style={s.bold}>{po.partyName}</Text>
            {po.partyAddress && <Text>{po.partyAddress}</Text>}
            <Text>
              State: {stateName(po.partyState)} ({po.partyState})
            </Text>
            <Text style={s.bold}>{po.partyGstin ? `GSTIN: ${po.partyGstin}` : "Unregistered"}</Text>
          </View>
          <View style={[s.cell, { flex: 1 }]}>
            <Text style={s.label}>DELIVER TO</Text>
            <Text>{po.deliveryAddress || [buyer.tradeName || buyer.legalName, buyer.address, buyer.city].filter(Boolean).join(", ")}</Text>
          </View>
        </View>

        <View style={[s.box, { borderTopWidth: 0 }]}>
          <View style={[s.row, { borderBottomWidth: 1, borderColor: BORDER }]} fixed>
            <Text style={[s.th, W("n")]}>#</Text>
            <Text style={[s.th, W("desc")]}>Description</Text>
            <Text style={[s.th, W("hsn")]}>HSN/SAC</Text>
            <Text style={[s.th, W("qty"), s.right]}>Qty</Text>
            <Text style={[s.th, W("rate"), s.right]}>Rate</Text>
            <Text style={[s.th, W("disc"), s.right]}>Disc%</Text>
            <Text style={[s.th, W("taxable"), s.right]}>Taxable</Text>
            <Text style={[s.th, W("gst"), s.right]}>GST%</Text>
            {inter ? (
              <Text style={[s.th, W("tax" as keyof typeof cols), s.right]}>IGST</Text>
            ) : (
              <>
                <Text style={[s.th, W("cgst" as keyof typeof cols), s.right]}>CGST</Text>
                <Text style={[s.th, W("sgst" as keyof typeof cols), s.right]}>{sLabel}</Text>
              </>
            )}
            <Text style={[s.th, W("total"), s.right, { borderRightWidth: 0 }]}>Amount</Text>
          </View>
          {po.items.map((i, idx) => (
            <View key={i.id} style={[s.row, { borderBottomWidth: 0.5, borderColor: "#d5d9de" }]} wrap={false}>
              <Text style={[s.td, W("n")]}>{idx + 1}</Text>
              <Text style={[s.td, W("desc")]}>{i.description}</Text>
              <Text style={[s.td, W("hsn")]}>{i.hsnSac}</Text>
              <Text style={[s.td, W("qty"), s.right]}>
                {i.qty} {i.unit}
              </Text>
              <Text style={[s.td, W("rate"), s.right]}>{i.rate.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</Text>
              <Text style={[s.td, W("disc"), s.right]}>{i.discountPct ? i.discountPct : ""}</Text>
              <Text style={[s.td, W("taxable"), s.right]}>{amt(i.taxable)}</Text>
              <Text style={[s.td, W("gst"), s.right]}>{i.gstRate}</Text>
              {inter ? (
                <Text style={[s.td, W("tax" as keyof typeof cols), s.right]}>{amt(i.igst)}</Text>
              ) : (
                <>
                  <Text style={[s.td, W("cgst" as keyof typeof cols), s.right]}>{amt(i.cgst)}</Text>
                  <Text style={[s.td, W("sgst" as keyof typeof cols), s.right]}>{amt(i.sgst)}</Text>
                </>
              )}
              <Text style={[s.td, W("total"), s.right, { borderRightWidth: 0 }]}>{amt(i.total)}</Text>
            </View>
          ))}
        </View>

        <View style={[s.box, s.row, { borderTopWidth: 0 }]} wrap={false}>
          <View style={[s.cell, { flex: 1.4, borderRightWidth: 1, borderColor: BORDER }]}>
            <Text style={s.label}>AMOUNT IN WORDS</Text>
            <Text style={s.bold}>{paiseToWords(po.grandTotal)}</Text>
          </View>
          <View style={[s.cell, { flex: 1 }]}>
            {(
              [["Taxable value", po.taxable], ...(inter ? [["IGST", po.igst]] : [["CGST", po.cgst], [sLabel, po.sgst]]), ["Round off", po.roundOff]] as Array<[string, number]>
            ).map(([k, v]) => (
              <View key={k} style={[s.row, { justifyContent: "space-between", marginBottom: 1.5 }]}>
                <Text>{k}</Text>
                <Text>{amt(v)}</Text>
              </View>
            ))}
            <View style={[s.row, { justifyContent: "space-between", borderTopWidth: 1, borderColor: BORDER, paddingTop: 3, marginTop: 2 }]}>
              <Text style={s.big}>Total</Text>
              <Text style={s.big}>
                {PDF_FONTS.rupee} {amt(po.grandTotal)}
              </Text>
            </View>
          </View>
        </View>

        <View style={[s.box, { borderTopWidth: 0 }]} wrap={false}>
          <View style={[s.row, { borderBottomWidth: 1, borderColor: BORDER }]}>
            <Text style={[s.th, { flex: 2 }]}>HSN/SAC</Text>
            <Text style={[s.th, { flex: 1 }, s.right]}>GST%</Text>
            <Text style={[s.th, { flex: 2 }, s.right]}>Taxable</Text>
            {inter ? (
              <Text style={[s.th, { flex: 2 }, s.right]}>IGST</Text>
            ) : (
              <>
                <Text style={[s.th, { flex: 2 }, s.right]}>CGST</Text>
                <Text style={[s.th, { flex: 2 }, s.right]}>{sLabel}</Text>
              </>
            )}
            <Text style={[s.th, { flex: 2, borderRightWidth: 0 }, s.right]}>Total tax</Text>
          </View>
          {summary.map((r) => (
            <View key={`${r.hsnSac}|${r.gstRate}`} style={s.row}>
              <Text style={[s.td, { flex: 2 }]}>{r.hsnSac}</Text>
              <Text style={[s.td, { flex: 1 }, s.right]}>{r.gstRate}</Text>
              <Text style={[s.td, { flex: 2 }, s.right]}>{amt(r.taxable)}</Text>
              {inter ? (
                <Text style={[s.td, { flex: 2 }, s.right]}>{amt(r.igst)}</Text>
              ) : (
                <>
                  <Text style={[s.td, { flex: 2 }, s.right]}>{amt(r.cgst)}</Text>
                  <Text style={[s.td, { flex: 2 }, s.right]}>{amt(r.sgst)}</Text>
                </>
              )}
              <Text style={[s.td, { flex: 2, borderRightWidth: 0 }, s.right]}>{amt(r.cgst + r.sgst + r.igst)}</Text>
            </View>
          ))}
        </View>

        <View style={[s.box, s.row, { borderTopWidth: 0, minHeight: 70 }]} wrap={false}>
          <View style={[s.cell, { flex: 1.4, borderRightWidth: 1, borderColor: BORDER }]}>
            <Text style={s.label}>INSTRUCTIONS</Text>
            <Text>Please quote PO No. {po.number} on your invoice and delivery challan.</Text>
            {po.notes && (
              <View style={{ marginTop: 4 }}>
                <Text style={s.label}>NOTES</Text>
                <Text>{po.notes}</Text>
              </View>
            )}
          </View>
          <View style={[s.cell, { flex: 1, justifyContent: "space-between" }]}>
            <Text style={[s.right, s.bold]}>For {buyer.tradeName || buyer.legalName}</Text>
            <Text style={[s.right, { marginTop: 36 }]}>Authorised Signatory</Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>This is a computer-generated document.</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPurchaseOrderPdf(po: LoadedPurchaseOrder, buyer: PoBuyer, logo: { data: Buffer; mime: string } | null) {
  return renderToBuffer(<PurchaseOrderPdf po={po} buyer={buyer} logo={logo} />);
}

/** Renders with the company's logo, retrying without it if the logo is the problem (same as sales PDFs). */
export async function purchaseOrderPdfFor(po: LoadedPurchaseOrder, company: PoBuyer & { logo: Uint8Array | null; logoMime: string | null }) {
  const logo = company.logo && company.logoMime !== "image/webp" ? { data: Buffer.from(company.logo), mime: company.logoMime ?? "image/png" } : null;
  try {
    return await renderPurchaseOrderPdf(po, company, logo);
  } catch (err) {
    if (!logo) throw err;
    console.error(`[pdf] PO ${po.number} failed with logo, retrying without:`, err);
    return renderPurchaseOrderPdf(po, company, null);
  }
}
