import "server-only";
import { Font } from "@react-pdf/renderer";
import { NOTO_SANS_BOLD, NOTO_SANS_REGULAR } from "./font-data";

/**
 * Fonts for PDFs. Noto Sans (subset, includes ₹) is embedded in the code as base64, so PDF
 * generation never depends on font files existing on disk — the working directory and shipped
 * files differ between hosts (this caused HTTP 500s on Hostinger).
 */
export interface PdfFonts {
  family: string;
  rupee: string;
}

let registered: PdfFonts | null = null;

export function pdfFonts(): PdfFonts {
  if (registered) return registered;
  Font.register({
    family: "Noto",
    fonts: [
      { src: NOTO_SANS_REGULAR, fontWeight: "normal" },
      { src: NOTO_SANS_BOLD, fontWeight: "bold" },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  registered = { family: "Noto", rupee: "₹" };
  return registered;
}
