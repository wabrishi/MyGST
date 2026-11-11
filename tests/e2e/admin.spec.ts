import { expect, test, type Page } from "@playwright/test";
import { signIn, signUp, uniqueEmail } from "./helpers";

/** Must match SUPER_ADMIN_EMAILS in the server's .env. */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@e2e.test";
const settled = (page: Page) => page.waitForLoadState("networkidle");

async function loginAdmin(page: Page) {
  // The admin account persists across runs: sign in, or sign up on the very first run.
  await signIn(page, ADMIN_EMAIL);
  const outcome = await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/login")).then(() => "in" as const),
    page.getByRole("alert").filter({ hasText: /invalid/i }).waitFor().then(() => "missing" as const),
  ]);
  if (outcome === "missing") {
    await signUp(page, "Platform Admin", ADMIN_EMAIL);
    await page.waitForURL((u) => !u.pathname.startsWith("/signup"));
  }
}

test("super-admin creates a company; owner completes the setup wizard", async ({ page, browser }) => {
  const ownerEmail = uniqueEmail("owner-admin-made");
  const companyName = `Admin Made ${Date.now()}`;
  let inviteLink = "";
  let companyId = "";

  await test.step("non-admins can't see the admin panel", async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await signUp(p, "Regular User", uniqueEmail("regular"));
    await p.waitForURL("**/onboarding");
    const res = await p.request.get("/admin", { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    await ctx.close();
  });

  await test.step("admin creates company and owner invitation", async () => {
    await loginAdmin(page);
    await page.goto("/admin/companies/new");
    await settled(page);
    await page.getByLabel("Legal name").fill(companyName);
    await page.getByRole("combobox", { name: "State" }).selectOption("27");
    await page.getByLabel("Owner email").fill(ownerEmail);
    await page.getByRole("button", { name: "Create company" }).click();
    await expect(page.getByText("Company created.")).toBeVisible();
    inviteLink = (await page.locator("code", { hasText: "/invite/" }).textContent())!.trim();

    await page.getByRole("link", { name: "View company" }).click();
    await page.waitForURL(/\/admin\/companies\/(?!new$)[^/]+$/);
    companyId = page.url().split("/").pop()!;
    await expect(page.getByText("Setup pending")).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(ownerEmail) })).toContainText("Pending invite");

    await page.goto(`/admin?q=${encodeURIComponent(companyName)}`);
    await expect(page.getByRole("link", { name: companyName })).toBeVisible();
  });

  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();

  await test.step("owner accepts and lands in the wizard", async () => {
    await signUp(owner, "Company Owner", ownerEmail);
    await owner.waitForURL("**/onboarding");
    await owner.goto(new URL(inviteLink).pathname);
    await settled(owner);
    await owner.getByRole("button", { name: "Accept invitation" }).click();
    await owner.waitForURL(`**/c/${companyId}/setup`);
    await expect(owner.getByRole("heading", { name: "Step 1: Business & GST" })).toBeVisible();
  });

  await test.step("owner completes the wizard", async () => {
    await settled(owner);
    await expect(owner.getByLabel("Legal name")).toHaveValue(companyName); // prefilled by admin
    await owner.getByLabel("Address").fill("42 MG Road, Pune");
    await owner.getByRole("button", { name: "Save & continue" }).click();
    await owner.waitForURL(/step=2/);
    await settled(owner);

    await owner.getByLabel("Account number").fill("50100123456789");
    await owner.getByLabel("IFSC").fill("HDFC0000123");
    await owner.getByRole("button", { name: "Save & continue" }).click();
    await owner.waitForURL(/step=3/);
    await settled(owner);

    await owner.getByRole("button", { name: "Save" }).click(); // keep default prefixes
    await expect(owner.getByText("Numbering saved")).toBeVisible();
    await owner.getByRole("link", { name: "Next →" }).click();
    await owner.waitForURL(/step=4/);
    await owner.getByRole("link", { name: "Next →" }).click();
    await owner.waitForURL(/step=5/);
    await settled(owner);

    // Steps 1–3 are ticked; team & records are not, so finishing asks for confirmation.
    await expect(owner.getByText("3 of 5 steps complete")).toBeVisible();
    owner.once("dialog", (d) => d.accept());
    await owner.getByRole("button", { name: "Finish setup" }).click();
    await owner.waitForURL(/dashboard\?setup=done/);
    await expect(owner.getByText("Your company is set up")).toBeVisible();
  });

  await test.step("admin suspends and reactivates", async () => {
    await page.goto(`/admin/companies/${companyId}`);
    await settled(page);
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Suspend company" }).click();
    await expect(page.getByText("Suspended", { exact: true })).toBeVisible();

    await owner.goto(`/c/${companyId}/dashboard`);
    await owner.waitForURL(/\/companies\?suspended=1/);
    await expect(owner.getByText("That company is suspended")).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Reactivate" }).click();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    await owner.goto(`/c/${companyId}/dashboard`);
    await expect(owner.getByRole("heading", { name: companyName })).toBeVisible();
  });

  await ownerCtx.close();
});
