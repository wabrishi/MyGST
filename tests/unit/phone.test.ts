import { describe, expect, it } from "vitest";
import { formatMobile, normalizeMobile, whatsappHref } from "@/lib/phone";

describe("mobile numbers", () => {
  it("accepts Indian mobiles typed in the usual ways", () => {
    for (const raw of ["9876543210", "98765 43210", "+91 98765-43210", "+919876543210", "09876543210", "919876543210", " (+91) 98765 43210 "]) {
      expect(normalizeMobile(raw), raw).toBe("+919876543210");
    }
  });

  it("refuses numbers that aren't mobiles", () => {
    for (const raw of ["", "12345", "5876543210", "98765432", "987654321012", "+91 5876543210", "+91 98765", "phone", "98765x43210", null, 9876543210]) {
      expect(normalizeMobile(raw as never), String(raw)).toBeNull();
    }
  });

  it("keeps overseas numbers written with their country code", () => {
    expect(normalizeMobile("+1 415 555 2671")).toBe("+14155552671");
    expect(normalizeMobile("+44 7911 123456")).toBe("+447911123456");
    expect(normalizeMobile("+1 23")).toBeNull();
  });

  it("formats for display and links", () => {
    expect(formatMobile("+919876543210")).toBe("+91 98765 43210");
    expect(formatMobile("+14155552671")).toBe("+14155552671");
    expect(formatMobile("")).toBe("");
    expect(whatsappHref("+919876543210")).toBe("https://wa.me/919876543210");
  });
});
