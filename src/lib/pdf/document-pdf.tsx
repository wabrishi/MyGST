import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { DOC_KINDS, kindOfType } from "../doc-kinds";
import type { LoadedDocument } from "../documents";
import { formatPaise, taxSummary } from "../gst/calc";
import { sgstLabel, stateName } from "../gst/states";
import { paiseToWords } from "../gst/words";
import { pdfFonts } from "./fonts";

const FONTS = pdfFonts();

const BORDER = "#9aa1ab";
const s = StyleSheet.create({
  page: { fontFamily: FONTS.family, fontSize: 8, padding: 24, paddingBottom: 40, color: "#111" },
  title: { fontSize: 13, fontWeight: "bold", textAlign: "center", letterSpacing: 1 },
  copy: { position: "absolute", right: 24, top: 26, fontSize: 7, color: "#555" },
  box: { borderWidth: 1, borderColor: BORDER },
  row: { flexDirection: "row" },
  cell: { padding: 5 },
  label: { color: "#555", fontSize: 7 },
  bold: { fontWeight: "bold" },
  big: { fontSize: 11, fontWeight: "bold" },
  th: { backgroundColor: "#eef1f5", fontWeight: "bold", paddingVertical: 4, paddingHorizontal: 3, borderRightWidth: 1, borderColor: BORDER },
  td: { paddingVertical: 3, paddingHorizontal: 3, borderRightWidth: 1, borderColor: BORDER },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  watermark: {
    position: "absolute",
    top: 330,
    left: 90,
    fontSize: 80,
    color: "#d0262d",
    opacity: 0.15,
    transform: "rotate(-30deg)",
    fontWeight: "bold",
  },
  footer: { position: "absolute", bottom: 18, left: 24, right: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#666" },
});

const amt = (p: number) => formatPaise(p);
/** YYYY-MM-DD -> DD-MM-YYYY */
const dmy = (iso: string) => (iso ? iso.split("-").reverse().join("-") : "");

function KV({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return (
    <View style={[s.row, { marginBottom: 1.5 }]}>
      <Text style={[s.label, { width: 78 }]}>{k}</Text>
      <Text style={{ flex: 1 }}>{v}</Text>
    </View>
  );
}

export function DocumentPdf({ doc, logo }: { doc: LoadedDocument; logo: { data: Buffer; mime: string } | null }) {
  const kind = DOC_KINDS[kindOfType(doc.type)];
  const seller = doc.seller;
  const sLabel = sgstLabel(seller.stateCode);
  const summary = taxSummary(doc.items);
  const inter = doc.isInterstate;

  // Column layout (flex weights) for the item table.
  const cols = inter
    ? { n: 4, desc: 30, hsn: 9, qty: 9, rate: 11, disc: 6, taxable: 12, gst: 6, tax: 11, total: 12 }
    : { n: 4, desc: 26, hsn: 9, qty: 9, rate: 10, disc: 5, taxable: 11, gst: 5, cgst: 9, sgst: 9, total: 11 };
  const W = (k: keyof typeof cols) => ({ flex: cols[k] as number });

  return (
    <Document title={`${kind.singular} ${doc.number}`} author={seller.legalName} creator="MyGST">
      <Page size="A4" style={s.page}>
        {doc.status === "CANCELLED" && <Text style={s.watermark}>CANCELLED</Text>}
        <Text style={s.title}>{kind.printTitle}</Text>
        {doc.type === "INVOICE" && <Text style={s.copy}>ORIGINAL FOR RECIPIENT</Text>}

        {/* Seller + document meta */}
        <View style={[s.box, s.row, { marginTop: 8 }]}>
          <View style={[s.cell, { flex: 1.3, borderRightWidth: 1, borderColor: BORDER }]}>
            <View style={s.row}>
              {logo && (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={{ data: logo.data, format: logo.mime === "image/png" ? "png" : "jpg" }} style={{ width: 60, height: 40, objectFit: "contain", marginRight: 8 }} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.big}>{seller.tradeName || seller.legalName}</Text>
                {seller.tradeName && seller.tradeName !== seller.legalName && <Text>{seller.legalName}</Text>}
                <Text>{[seller.address, seller.city, seller.pincode].filter(Boolean).join(", ")}</Text>
                <Text>State: {stateName(seller.stateCode)} ({seller.stateCode})</Text>
                {seller.gstin ? <Text style={s.bold}>GSTIN: {seller.gstin}</Text> : <Text>Unregistered</Text>}
                {(seller.phone || seller.email) && <Text>{[seller.phone, seller.email].filter(Boolean).join(" · ")}</Text>}
              </View>
            </View>
          </View>
          <View style={[s.cell, { flex: 1 }]}>
            <KV k={`${kind.singular} No.`} v={doc.number} />
            <KV k="Date" v={dmy(doc.date)} />
            {doc.type === "QUOTATION" ? <KV k="Valid until" v={dmy(doc.dueDate)} /> : <KV k="Due date" v={dmy(doc.dueDate)} />}
            <KV k="Place of supply" v={`${stateName(doc.placeOfSupply)} (${doc.placeOfSupply})`} />
            {doc.type === "INVOICE" && <KV k="Reverse charge" v={doc.reverseCharge ? "Yes" : "No"} />}
            {doc.originalDoc && <KV k="Against invoice" v={`${doc.originalDoc.number} dt. ${dmy(doc.originalDoc.date)}`} />}
            {doc.noteReason && <KV k="Reason" v={doc.noteReason} />}
          </View>
        </View>

        {/* Buyer */}
        <View style={[s.box, s.row, { borderTopWidth: 0 }]}>
          <View style={[s.cell, { flex: 1, borderRightWidth: 1, borderColor: BORDER }]}>
            <Text style={s.label}>BILL TO</Text>
            <Text style={s.bold}>{doc.partyName}</Text>
            {doc.partyAddress && <Text>{doc.partyAddress}</Text>}
            <Text>
              State: {stateName(doc.partyState)} ({doc.partyState})
            </Text>
            <Text style={s.bold}>{doc.partyGstin ? `GSTIN: ${doc.partyGstin}` : "Unregistered"}</Text>
          </View>
          <View style={[s.cell, { flex: 1 }]}>
            <Text style={s.label}>SHIP TO</Text>
            <Text>{doc.shippingAddress || "Same as billing address"}</Text>
          </View>
        </View>

        {/* Items */}
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
          {doc.items.map((i, idx) => (
            <View key={idx} style={[s.row, { borderBottomWidth: 0.5, borderColor: "#d5d9de" }]} wrap={false}>
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

        {/* Totals + words */}
        <View style={[s.box, s.row, { borderTopWidth: 0 }]} wrap={false}>
          <View style={[s.cell, { flex: 1.4, borderRightWidth: 1, borderColor: BORDER }]}>
            <Text style={s.label}>AMOUNT IN WORDS</Text>
            <Text style={s.bold}>{paiseToWords(doc.grandTotal)}</Text>
            {doc.reverseCharge && <Text style={{ marginTop: 4 }}>Tax on this supply is payable by the recipient under reverse charge.</Text>}
          </View>
          <View style={[s.cell, { flex: 1 }]}>
            {(
              [
                ["Taxable value", doc.taxable],
                ...(inter ? [["IGST", doc.igst]] : [["CGST", doc.cgst], [sLabel, doc.sgst]]),
                ["Round off", doc.roundOff],
              ] as Array<[string, number]>
            ).map(([k, v]) => (
              <View key={k} style={[s.row, { justifyContent: "space-between", marginBottom: 1.5 }]}>
                <Text>{k}</Text>
                <Text>{amt(v)}</Text>
              </View>
            ))}
            <View style={[s.row, { justifyContent: "space-between", borderTopWidth: 1, borderColor: BORDER, paddingTop: 3, marginTop: 2 }]}>
              <Text style={s.big}>Total</Text>
              <Text style={s.big}>
                {FONTS.rupee} {amt(doc.grandTotal)}
              </Text>
            </View>
          </View>
        </View>

        {/* HSN-wise tax summary */}
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

        {/* Bank, terms, signature */}
        <View style={[s.box, s.row, { borderTopWidth: 0, minHeight: 70 }]} wrap={false}>
          <View style={[s.cell, { flex: 1.4, borderRightWidth: 1, borderColor: BORDER }]}>
            {seller.bankAccount && doc.type !== "CREDIT_NOTE" && (
              <View style={{ marginBottom: 4 }}>
                <Text style={s.label}>BANK DETAILS</Text>
                <Text>
                  {seller.bankName}
                  {seller.bankBranch ? `, ${seller.bankBranch}` : ""}
                </Text>
                <Text>
                  A/c: {seller.bankAccount} · IFSC: {seller.bankIfsc}
                </Text>
                {seller.upiId && <Text>UPI: {seller.upiId}</Text>}
              </View>
            )}
            {doc.notes && (
              <View style={{ marginBottom: 4 }}>
                <Text style={s.label}>NOTES</Text>
                <Text>{doc.notes}</Text>
              </View>
            )}
            {seller.terms && (
              <View>
                <Text style={s.label}>TERMS & CONDITIONS</Text>
                <Text>{seller.terms}</Text>
              </View>
            )}
          </View>
          <View style={[s.cell, { flex: 1, justifyContent: "space-between" }]}>
            <Text style={[s.right, s.bold]}>For {seller.tradeName || seller.legalName}</Text>
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

export async function renderDocumentPdf(doc: LoadedDocument, logo: { data: Buffer; mime: string } | null) {
  return renderToBuffer(<DocumentPdf doc={doc} logo={logo} />);
}
