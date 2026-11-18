import { expect, test, type Browser, type Page } from "@playwright/test";
import { makeGstin, setupCompany, signIn, signUp, uniqueEmail } from "./helpers";

/** Must match SUPER_ADMIN_EMAILS in the server's .env. */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@e2e.test";
const settled = (page: Page) => page.waitForLoadState("networkidle");
/** The success message an action shows at the top of the page. */
const notice = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });

async function adminPage(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
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

async function uninstall(admin: Page, pluginId: string) {
  await admin.goto(`/admin/plugins/${pluginId}`);
  await settled(admin);
  const btn = admin.getByRole("button", { name: "Uninstall" });
  if (!(await btn.count())) return;
  let n = 0;
  const onDialog = (d: import("@playwright/test").Dialog) => (n++ === 0 ? d.accept() : d.dismiss()); // confirm; don't keep data
  admin.on("dialog", onDialog);
  await btn.click();
  await admin.waitForURL("**/admin/plugins");
  admin.off("dialog", onDialog);
}

test("super admin downloads plugins; Lead Manager: pipeline, follow-up, convert, quotation", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const admin = await adminPage(browser);

  await test.step("super admin: Download on every plugin, built-in file is uploadable", async () => {
    await uninstall(admin, "lead-manager");
    await admin.goto("/admin/plugins");
    await settled(admin);
    const row = admin.getByRole("row", { name: /Lead Manager/ });
    await expect(row.getByRole("link", { name: "Download" })).toBeVisible();
    const res = await admin.request.get("/admin/plugins/lead-manager/download");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toContain('filename="lead-manager-1.0.0.mygst-plugin.js"');
    expect(res.headers()["x-checksum-sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(await res.text()).toContain("mygst-plugin lead-manager@1.0.0");

    // Install it for every company, on by default.
    await row.getByRole("button", { name: "Install", exact: true }).click();
    const dialog = admin.getByRole("dialog", { name: "Install Lead Manager" });
    await dialog.getByLabel(/Yes, on by default/).check();
    await dialog.getByLabel(/^All companies/).check();
    await dialog.getByRole("button", { name: "Install plugin" }).click();
    await expect(row.getByText("Installed", { exact: true })).toBeVisible();
  });

  const base = await setupCompany(page, { email: uniqueEmail("leads-owner"), legalName: "Leads Owner Co", gstin: makeGstin("27") });

  await test.step("a company user can't download plugins", async () => {
    expect((await page.request.get("/admin/plugins/lead-manager/download")).status()).toBe(404);
  });

  await test.step("the sidebar has a Lead Manager section", async () => {
    await page.goto(`${base}/dashboard`);
    const nav = page.getByRole("navigation", { name: "Main" }).first();
    await expect(nav.getByText("Lead Manager", { exact: true })).toBeVisible();
    for (const name of ["Pipeline", "Leads", "Follow-ups"]) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  });

  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  await test.step("create a lead with a follow-up today", async () => {
    await page.goto(`${base}/apps/lead-manager/leads`);
    await page.getByRole("link", { name: "+ New lead" }).click();
    await page.getByLabel("Contact name").fill("Ravi Kumar");
    await page.getByLabel("Business name").fill("Acme Steel");
    await page.getByLabel("Expected deal value (₹)").fill("50000");
    await page.getByLabel("First follow-up").fill(today);
    await page.getByLabel("Follow-up note").fill("Call about pricing");
    await page.getByRole("button", { name: "Create lead" }).click();
    await expect(notice(page, "Lead created")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Ravi Kumar/ })).toBeVisible();
  });

  await test.step("dashboard widget shows today's follow-up", async () => {
    await page.goto(`${base}/dashboard`);
    await expect(page.getByTestId("widget-lead-manager:today")).toContainText("Ravi Kumar");
  });

  await test.step("move it forward in the pipeline", async () => {
    await page.goto(`${base}/apps/lead-manager/pipeline`);
    await page.getByRole("button", { name: "Move Ravi Kumar forward" }).click();
    await expect(notice(page, "Ravi Kumar moved to Contacted")).toBeVisible();
    await expect(page.getByRole("region", { name: "Contacted" })).toContainText("Ravi Kumar");
  });

  await test.step("convert to a customer and quote: the lead moves to Proposal", async () => {
    await page.getByRole("link", { name: "Ravi Kumar" }).click();
    await page.getByRole("button", { name: "Convert to customer" }).click();
    await expect(notice(page, "Customer created")).toBeVisible();
    await page.getByLabel("Quick quotation: item").fill("Steel supply contract");
    await page.getByLabel("Rate (₹)").fill("45000");
    await page.getByRole("button", { name: "Create quotation" }).click();
    await expect(notice(page, /Quotation QT.* created/)).toBeVisible();
    // The quotation.created event is delivered right after the request.
    await expect(async () => {
      await page.reload();
      await expect(page.getByText(/Stage: Contacted → Proposal/)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /^QT/ })).toBeVisible();
  });

  await test.step("follow-up done", async () => {
    await page.goto(`${base}/apps/lead-manager/follow-ups`);
    await page.getByRole("button", { name: "Done" }).first().click();
    await expect(notice(page, "Follow-up done")).toBeVisible();
    await expect(page.getByText("You're all caught up")).toBeVisible();
  });

  await test.step("clean up: uninstall", async () => {
    await uninstall(admin, "lead-manager");
  });
});
