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

/** Puts the menu back in the built-in order (if it isn't already). */
async function resetMenu(admin: Page) {
  await admin.goto("/admin/menu");
  await admin.waitForLoadState("networkidle");
  const reset = admin.getByRole("button", { name: "Reset to default" });
  if (await reset.isDisabled()) return;
  await reset.click();
  await admin.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(admin.getByText("Menu reset to the default order")).toBeVisible();
}

const sidebarLinks = (page: Page) => page.getByRole("navigation", { name: "Main" }).first().getByRole("link").allTextContents();

test("super admin re-arranges the sidebar; users collapse sections", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const admin = await adminPage(browser);
  await resetMenu(admin);

  await test.step("admin: Purchases above Sales (button), Payments first in Sales (drag), save", async () => {
    await admin.getByRole("button", { name: "Move Purchases up" }).click();
    await admin.getByTestId("item-sales-payments").dragTo(admin.getByTestId("item-sales-invoices"), { targetPosition: { x: 20, y: 2 } });
    await expect(admin.getByText("Unsaved changes")).toBeVisible();
    const sections = admin.getByRole("list", { name: "Menu sections" }).locator("> li");
    await expect(sections.first()).toHaveAttribute("aria-label", "Purchases");
    await expect(admin.getByRole("list", { name: "Sales items" }).locator("> li").first()).toContainText("Payments");
    await admin.getByRole("button", { name: "Save order" }).click();
    await expect(admin.getByText("Menu order saved for every company")).toBeVisible();
  });

  const base = await setupCompany(page, { email: uniqueEmail("menu-owner"), legalName: "Menu Owner Co", gstin: makeGstin("27") });

  await test.step("owner's sidebar follows the saved order", async () => {
    await page.goto(`${base}/dashboard`);
    const links = await sidebarLinks(page);
    expect(links[0]).toBe("Dashboard");
    expect(links.indexOf("Purchase orders")).toBeLessThan(links.indexOf("Invoices"));
    expect(links.indexOf("Payments")).toBeLessThan(links.indexOf("Invoices"));
  });

  await test.step("collapsing a section hides its links and is remembered", async () => {
    const nav = page.getByRole("navigation", { name: "Main" }).first();
    const masters = nav.getByRole("button", { name: "Masters" });
    await expect(masters).toHaveAttribute("aria-expanded", "true");
    await masters.click();
    await expect(masters).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("link", { name: "Parties" })).toBeHidden();
    await page.reload();
    await expect(nav.getByRole("button", { name: "Masters" })).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("link", { name: "Parties" })).toBeHidden();
  });

  await test.step("opening a page in a collapsed section shows it open", async () => {
    await page.goto(`${base}/parties`);
    const nav = page.getByRole("navigation", { name: "Main" }).first();
    await expect(nav.getByRole("link", { name: "Parties" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Masters" })).toHaveAttribute("aria-expanded", "true");
  });

  await test.step("reset to default restores the built-in order", async () => {
    await resetMenu(admin);
    await page.goto(`${base}/dashboard`);
    const links = await sidebarLinks(page);
    expect(links.indexOf("Invoices")).toBeLessThan(links.indexOf("Purchase orders"));
    expect(links.indexOf("Invoices")).toBeLessThan(links.indexOf("Payments"));
  });
});
