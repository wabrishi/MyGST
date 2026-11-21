import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getContactDetails, getSiteContact, saveSiteContact, SITE_CONTACT_KEY } from "@/lib/site-store";

/** Mobile numbers: sign-up through Better Auth, and the website's contact details. */
describe("mobile numbers", () => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const emails: string[] = [];
  let savedSetting: unknown;
  const envBefore = process.env.CONTACT_PHONE;

  beforeAll(async () => {
    savedSetting = (await db.systemState.findUnique({ where: { key: SITE_CONTACT_KEY } }))?.value;
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { in: emails } } });
    if (savedSetting === undefined) await db.systemState.deleteMany({ where: { key: SITE_CONTACT_KEY } });
    else await db.systemState.update({ where: { key: SITE_CONTACT_KEY }, data: { value: savedSetting as object } });
    process.env.CONTACT_PHONE = envBefore;
    await db.$disconnect();
  });

  it("sign-up needs a valid mobile and stores it normalised", async () => {
    const email = `mobile-${stamp}@test.local`;
    emails.push(email, `nomobile-${stamp}@test.local`, `badmobile-${stamp}@test.local`);
    await expect(auth.api.signUpEmail({ body: { name: "No Mobile", email: `nomobile-${stamp}@test.local`, password: "Passw0rd!123" } })).rejects.toThrow(/10-digit mobile/);
    await expect(auth.api.signUpEmail({ body: { name: "Bad Mobile", email: `badmobile-${stamp}@test.local`, phone: "12345", password: "Passw0rd!123" } })).rejects.toThrow(/10-digit mobile/);
    await auth.api.signUpEmail({ body: { name: "Has Mobile", email, phone: "098765 43210", password: "Passw0rd!123" } });
    expect((await db.user.findUniqueOrThrow({ where: { email } })).phone).toBe("+919876543210");
  });

  it("website contact details: saved in admin, else from the environment", async () => {
    await db.systemState.deleteMany({ where: { key: SITE_CONTACT_KEY } });
    process.env.CONTACT_PHONE = "9123456780";
    expect((await getSiteContact()).mobile).toBe("+919123456780");

    await expect(saveSiteContact({ mobile: "123", whatsapp: "", email: "", address: "", notifyEmail: "" })).rejects.toThrow(/10-digit mobile/);
    await saveSiteContact({ mobile: "98765 43210", whatsapp: "98765 43210", email: "hello@test.local", address: "Pune", notifyEmail: "" });
    const c = await getSiteContact();
    expect(c).toMatchObject({ mobile: "+919876543210", whatsapp: "+919876543210", email: "hello@test.local", notifyEmail: "hello@test.local" });
    expect(await getContactDetails()).toMatchObject({ phone: { label: "+91 98765 43210", href: "tel:+919876543210" }, whatsapp: "https://wa.me/919876543210" });
  });
});
