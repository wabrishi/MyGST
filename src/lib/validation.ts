import { z } from "zod";
import { isStateCode, isValidGstin, normalizeGstin, stateFromGstin } from "./gst";

/** Shared Zod building blocks used by both client forms and server actions. */

export const trimmed = (max = 200) => z.string().trim().max(max, `Max ${max} characters`);

export const optionalGstin = z
  .string()
  .transform(normalizeGstin)
  .refine((g) => g === "" || isValidGstin(g), "Invalid GSTIN (check the format and last character)");

export const stateCode = z.string().refine(isStateCode, "Select a state");

export const pincode = z
  .string()
  .trim()
  .refine((p) => p === "" || /^[1-9][0-9]{5}$/.test(p), "PIN code must be 6 digits");

export const phone = z
  .string()
  .trim()
  .refine((p) => p === "" || /^[+0-9 ()-]{7,20}$/.test(p), "Invalid phone number");

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((e) => e === "" || z.email().safeParse(e).success, "Invalid email");

export const money = (label = "Amount") =>
  z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} can't be negative`).max(1e11);

export const gstRate = z.coerce.number({ error: "GST rate must be a number" }).min(0).max(100);

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

/** When a GSTIN is given, its first two digits are the state; reject a contradicting state. */
const gstinStateMatches = <T extends { gstin: string; stateCode: string }>(v: T, ctx: z.RefinementCtx) => {
  if (v.gstin && stateFromGstin(v.gstin) !== v.stateCode) {
    ctx.addIssue({ code: "custom", path: ["stateCode"], message: "State must match the GSTIN (first 2 digits)" });
  }
};

export const companySchema = z
  .object({
    legalName: trimmed(150).min(1, "Legal name is required"),
    tradeName: trimmed(150).default(""),
    gstin: optionalGstin.default(""),
    address: trimmed(500).default(""),
    city: trimmed(80).default(""),
    pincode: pincode.default(""),
    stateCode,
    phone: phone.default(""),
    email: optionalEmail.default(""),
    bankName: trimmed(100).default(""),
    bankAccount: z.string().trim().regex(/^[0-9]{0,20}$/, "Account number must be digits").default(""),
    bankIfsc: z
      .string()
      .trim()
      .toUpperCase()
      .refine((s) => s === "" || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s), "Invalid IFSC")
      .default(""),
    bankBranch: trimmed(100).default(""),
    upiId: z
      .string()
      .trim()
      .refine((s) => s === "" || /^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(s), "Invalid UPI ID")
      .default(""),
    terms: trimmed(2000).default(""),
    pricesIncludeTax: z.coerce.boolean().default(false),
  })
  .superRefine(gstinStateMatches);

export type CompanyInput = z.input<typeof companySchema>;

export const partySchema = z
  .object({
    type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]),
    name: trimmed(150).min(1, "Name is required"),
    gstin: optionalGstin.default(""),
    phone: phone.default(""),
    email: optionalEmail.default(""),
    billingAddress: trimmed(500).default(""),
    shippingAddress: trimmed(500).default(""),
    stateCode,
    shippingState: z
      .string()
      .default("")
      .refine((s) => s === "" || isStateCode(s), "Select a state"),
    openingBalance: z.coerce.number().min(-1e11).max(1e11).default(0),
    creditDays: z.coerce.number().int().min(0).max(365).default(0),
  })
  .superRefine(gstinStateMatches);

export type PartyInput = z.input<typeof partySchema>;

export const productSchema = z.object({
  name: trimmed(200).min(1, "Name is required"),
  hsnSac: z
    .string()
    .trim()
    .refine((s) => s === "" || /^[0-9]{4,8}$/.test(s), "HSN/SAC must be 4–8 digits")
    .default(""),
  isService: z.coerce.boolean().default(false),
  unit: trimmed(10).min(1).default("NOS"),
  salePrice: money("Sale price").default(0),
  purchasePrice: money("Purchase price").default(0),
  gstRate,
});

export type ProductInput = z.input<typeof productSchema>;
