import { describe, expect, it } from "vitest";
import { BUILTIN_ADMIN_PERMISSIONS } from "@/lib/admin-permissions";
import { contactEmailHtml, contactSchema, formToken, MIN_FILL_MS, spamCheck } from "@/lib/contact";
import { COMPARISON, PLANS, planPrice } from "@/lib/site";

describe("pricing", () => {
  it("monthly and yearly prices (yearly = 10 months for Business)", () => {
    const business = PLANS.find((p) => p.id === "business")!;
    expect(planPrice(business, "monthly")).toEqual({ perMonth: 499, billed: 499 });
    expect(planPrice(business, "yearly")).toEqual({ perMonth: 416, billed: 4990 });
    expect(planPrice(PLANS.find((p) => p.id === "starter")!, "yearly")).toEqual({ perMonth: 0, billed: 0 });
    expect(planPrice(PLANS.find((p) => p.id === "enterprise")!, "monthly")).toBeNull();
  });

  it("the comparison table has a value for every plan", () => {
    for (const g of COMPARISON) for (const row of g.rows) expect(row).toHaveLength(1 + PLANS.length);
  });
});

describe("contact form", () => {
  const valid = { name: "Asha Rao", email: "Asha@Example.com", phone: "+91 98765 43210", company: "", topic: "sales", message: "Please tell me about pricing." };

  it("validates and cleans input", () => {
    expect(contactSchema.parse(valid)).toMatchObject({ email: "asha@example.com", phone: "+919876543210", topic: "sales" });
    expect(contactSchema.parse({ ...valid, topic: "weird" }).topic).toBe("other");
    expect(() => contactSchema.parse({ ...valid, email: "nope" })).toThrow(/valid email/);
    expect(() => contactSchema.parse({ ...valid, message: "hi" })).toThrow(/at least 10/);
    expect(() => contactSchema.parse({ ...valid, phone: "abc" })).toThrow(/10-digit mobile/);
    expect(() => contactSchema.parse({ ...valid, phone: "" })).toThrow(/10-digit mobile/);
    const { phone: _omit, ...noPhone } = valid;
    void _omit;
    expect(() => contactSchema.parse(noPhone)).toThrow(/10-digit mobile/);
    expect(() => contactSchema.parse({ ...valid, message: "x".repeat(5001) })).toThrow(/5,000/);
  });

  it("spam checks: honeypot, too fast, tampered or old tokens", () => {
    const t0 = 1_800_000_000_000;
    const token = formToken(t0);
    expect(spamCheck({ token }, t0 + MIN_FILL_MS + 1)).toBe("ok");
    expect(spamCheck({ token, website: "http://spam" }, t0 + 10_000)).toBe("honeypot");
    expect(spamCheck({ token }, t0 + 1_000)).toBe("too-fast");
    expect(spamCheck({ token: `${t0 - 5000}.${token.split(".")[1]}` }, t0 + 10_000)).toBe("bad-token");
    expect(spamCheck({ token }, t0 + 2 * 24 * 3600_000)).toBe("bad-token");
    expect(spamCheck({}, t0)).toBe("bad-token");
  });

  it("escapes the message in the notification email", () => {
    const html = contactEmailHtml(contactSchema.parse({ ...valid, message: "<script>alert(1)</script> hello there" }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("Super admin and Support can read website messages; only Super admin edits the website", () => {
    expect(BUILTIN_ADMIN_PERMISSIONS.SUPER_ADMIN).toContain("website.manage");
    expect(BUILTIN_ADMIN_PERMISSIONS.SUPPORT).not.toContain("website.manage");
    expect(BUILTIN_ADMIN_PERMISSIONS.SUPER_ADMIN).toContain("messages.view");
    expect(BUILTIN_ADMIN_PERMISSIONS.SUPPORT).toContain("messages.view");
    expect(BUILTIN_ADMIN_PERMISSIONS.VIEWER).not.toContain("messages.view");
  });
});
