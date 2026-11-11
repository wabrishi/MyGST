import { describe, expect, it } from "vitest";
import {
  calcDocument,
  calcLine,
  creditNoteDeadline,
  financialYear,
  financialYearRange,
  formatDocNumber,
  gstinCheckChar,
  isValidGstin,
  monthRange,
  paiseToWords,
  sgstLabel,
  taxSummary,
  toPaise,
  todayIST,
} from "@/lib/gst";

describe("calcLine", () => {
  it("splits intra-state tax into CGST + SGST", () => {
    expect(calcLine({ qty: 1, rate: 1000, gstRate: 18 }, { interstate: false })).toEqual({
      taxable: 100000, cgst: 9000, sgst: 9000, igst: 0, total: 118000,
    });
  });

  it("charges IGST for inter-state supply", () => {
    expect(calcLine({ qty: 1, rate: 1000, gstRate: 18 }, { interstate: true })).toEqual({
      taxable: 100000, cgst: 0, sgst: 0, igst: 18000, total: 118000,
    });
  });

  it("applies discount before tax", () => {
    const r = calcLine({ qty: 2, rate: 500, discountPct: 10, gstRate: 5 }, { interstate: false });
    expect(r.taxable).toBe(90000);
    expect(r.cgst).toBe(2250);
    expect(r.sgst).toBe(2250);
  });

  it("back-calculates taxable value for tax-inclusive prices", () => {
    const r = calcLine({ qty: 1, rate: 1180, gstRate: 18 }, { interstate: true, pricesIncludeTax: true });
    expect(r.taxable).toBe(100000);
    expect(r.igst).toBe(18000);
    expect(r.total).toBe(118000);
  });

  it("handles fractional quantities and binary float artefacts", () => {
    expect(toPaise(1.005)).toBe(101);
    expect(calcLine({ qty: 2.5, rate: 33.33, gstRate: 12 }, { interstate: true }).taxable).toBe(8333);
  });

  it("treats garbage input as zero", () => {
    expect(calcLine({ qty: NaN, rate: 10, gstRate: 18 }, { interstate: false }).total).toBe(0);
  });
});

describe("calcDocument", () => {
  it("sums lines and rounds grand total to the rupee", () => {
    const { totals, lines } = calcDocument(
      [
        { qty: 3, rate: 99.99, gstRate: 18 },
        { qty: 1, rate: 49.5, gstRate: 5 },
      ],
      { interstate: false },
    );
    expect(lines).toHaveLength(2);
    // 299.97 taxable -> 27.00 + 27.00 (rounded per-half), 49.50 -> 1.24 + 1.24
    expect(totals.taxable).toBe(29997 + 4950);
    expect(totals.cgst).toBe(2700 + 124);
    expect(totals.exact).toBe(totals.taxable + totals.cgst + totals.sgst);
    expect(totals.grandTotal % 100).toBe(0);
    expect(totals.grandTotal - totals.exact).toBe(totals.roundOff);
    expect(Math.abs(totals.roundOff)).toBeLessThanOrEqual(50);
  });

  it("stays exact over many lines", () => {
    const lines = Array.from({ length: 500 }, () => ({ qty: 1, rate: 0.1, gstRate: 18 }));
    const { totals } = calcDocument(lines, { interstate: true });
    expect(totals.taxable).toBe(5000);
    expect(totals.igst).toBe(500 * 2);
  });

  it("builds an HSN/rate tax summary", () => {
    const { lines } = calcDocument(
      [
        { qty: 1, rate: 100, gstRate: 18, hsnSac: "8471" },
        { qty: 2, rate: 100, gstRate: 18, hsnSac: "8471" },
        { qty: 1, rate: 100, gstRate: 5, hsnSac: "1006" },
      ],
      { interstate: false },
    );
    const s = taxSummary(lines);
    expect(s).toHaveLength(2);
    expect(s.find((r) => r.hsnSac === "8471")?.taxable).toBe(30000);
  });
});

describe("GSTIN", () => {
  it("accepts a valid GSTIN", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin(" 27aapfu0939f1zv ")).toBe(true);
  });

  it("rejects bad check digit, length or state", () => {
    expect(isValidGstin("27AAPFU0939F1ZW")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    const body = "99AAPFU0939F1Z";
    expect(isValidGstin(body + gstinCheckChar(body))).toBe(false);
    expect(isValidGstin("")).toBe(false);
  });
});

describe("financial year", () => {
  it("rolls over on 1 April", () => {
    expect(financialYear("2026-03-31")).toBe("25-26");
    expect(financialYear("2026-04-01")).toBe("26-27");
    expect(financialYearRange("2027-01-15")).toEqual(["2026-04-01", "2027-03-31"]);
  });

  it("computes month ranges incl. leap years", () => {
    expect(monthRange("2028-02-10")).toEqual(["2028-02-01", "2028-02-29"]);
  });

  it("computes credit note deadline", () => {
    expect(creditNoteDeadline("2026-06-01")).toBe("2027-11-30");
    expect(creditNoteDeadline("2027-02-01")).toBe("2027-11-30");
  });

  it("uses IST for today", () => {
    expect(todayIST(new Date("2026-03-31T19:00:00Z"))).toBe("2026-04-01");
  });
});

describe("document numbers", () => {
  it("formats within 16 chars", () => {
    expect(formatDocNumber("INV/", "26-27", 1)).toBe("INV/26-27/0001");
    expect(formatDocNumber("ABCDEF", "26-27", 9999)).toHaveLength(16);
    expect(() => formatDocNumber("ABCDEF", "26-27", 12345)).toThrow();
    expect(formatDocNumber("I", "26-27", 12345)).toBe("I26-27/12345");
  });
});

describe("amount in words", () => {
  it("uses Indian numbering", () => {
    expect(paiseToWords(0)).toBe("Rupees Zero Only");
    expect(paiseToWords(100_000_00)).toBe("Rupees One Lakh Only");
    expect(paiseToWords(12_34_56_789_50)).toBe(
      "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Fifty Paise Only",
    );
  });
});

describe("labels", () => {
  it("uses UTGST for UTs without legislature", () => {
    expect(sgstLabel("04")).toBe("UTGST");
    expect(sgstLabel("07")).toBe("SGST");
  });
});
