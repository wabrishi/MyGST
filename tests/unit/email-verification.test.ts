import { describe, expect, it } from "vitest";
import { verificationRequired } from "@/lib/email-verification";

describe("email verification switch", () => {
  it("follows SMTP when EMAIL_VERIFICATION isn't set", () => {
    expect(verificationRequired({})).toBe(false);
    expect(verificationRequired({ SMTP_HOST: "smtp.hostinger.com" })).toBe(true);
    expect(verificationRequired({ SMTP_HOST: "  " })).toBe(false);
  });

  it("can be forced on or off", () => {
    expect(verificationRequired({ EMAIL_VERIFICATION: "on" })).toBe(true);
    expect(verificationRequired({ EMAIL_VERIFICATION: '"true"' })).toBe(true);
    expect(verificationRequired({ EMAIL_VERIFICATION: "off", SMTP_HOST: "smtp.hostinger.com" })).toBe(false);
    expect(verificationRequired({ EMAIL_VERIFICATION: "maybe", SMTP_HOST: "x" })).toBe(true);
  });
});
