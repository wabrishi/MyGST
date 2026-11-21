import { expect, test, type Browser, type Page } from "@playwright/test";
import { makeGstin, setupCompany, signIn, signUp, uniqueEmail } from "./helpers";

/** Must match SUPER_ADMIN_EMAILS in the server's .env. */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@e2e.test";

async function adminPage(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, ADMIN_EMAIL);
  const outcome = await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/login")).then(() => "in" as const),
    page.getByRole("alert").filter({ hasText: /invalid/i }).waitFor().then(() => "missing" as const),
  ]);
  if (outcome === "missing") {
    await signUp(page, "Platform Admin", ADMIN_EMAIL);
    await page.waitForURL((u) => !u.pathname.startsWith("/signup"));
  }
  return page;
}

async function saveWebsite(admin: Page, mobile: string) {
  await admin.goto("/admin/website");
  await admin.getByLabel("Mobile number").fill(mobile);
  await admin.getByRole("button", { name: "Save contact details" }).click();
  await expect(admin.getByText(/Contact details saved/)).toBeVisible();
}

test("super admin sets the website mobile; it shows on the Contact page and footer", async ({ browser }) => {
  const admin = await adminPage(browser);
  const before = await (async () => {
    await admin.goto("/admin/website");
    return admin.getByLabel("Mobile number").inputValue();
  })();
  try {
    await saveWebsite(admin, "91234 56780");
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto("/contact");
    await expect(visitor.getByRole("link", { name: "+91 91234 56780" }).first()).toHaveAttribute("href", "tel:+919123456780");
    await expect(visitor.getByRole("contentinfo").getByRole("link", { name: "+91 91234 56780" })).toBeVisible();

    // The contact form needs a valid mobile.
    await visitor.getByLabel("Your name").fill("Mobile Tester");
    await visitor.getByLabel("Email").fill(`mobile.${Date.now()}@e2e.test`);
    await visitor.getByLabel("Mobile number").fill("12345");
    await visitor.getByLabel("Message").fill("Checking the mobile number rule.");
    await visitor.waitForTimeout(3_200);
    await visitor.getByRole("button", { name: "Send message" }).click();
    await expect(visitor.getByText("Enter a valid 10-digit mobile number")).toBeVisible();
  } finally {
    await saveWebsite(admin, before);
  }
});

test("sign-up asks for a mobile; profile and team list show it", async ({ page }) => {
  // A wrong number is refused before the account is created.
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Bad Mobile");
  await page.getByLabel("Email").fill(uniqueEmail("badmobile"));
  await page.getByLabel("Mobile number").fill("12345");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter a valid 10-digit mobile number" })).toBeVisible();

  const base = await setupCompany(page, { email: uniqueEmail("mobile-owner"), legalName: "Mobile Owner Co", gstin: makeGstin("27") });

  await page.goto(`${base}/settings/users`);
  await expect(page.getByRole("link", { name: /^\+91 9\d{4} \d{5}$/ })).toBeVisible();

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "My profile" }).click();
  await page.waitForURL("**/account");
  await expect(page.getByLabel("Mobile number")).toHaveValue(/^\+91 9\d{4} \d{5}$/);
  await page.getByLabel("Mobile number").fill("50000 12345");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Enter a valid 10-digit mobile number")).toBeVisible();
  await page.getByLabel("Mobile number").fill("70000 12345");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Mobile number")).toHaveValue("+91 70000 12345");
});
