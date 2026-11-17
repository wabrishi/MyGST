import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { makeGstin, setupCompany, signIn, signUp, uniqueEmail } from "./helpers";

/** Must match SUPER_ADMIN_EMAILS in the server's .env. */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@e2e.test";
const settled = (page: Page) => page.waitForLoadState("networkidle");

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

async function openUser(admin: Page, email: string) {
  await admin.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  await settled(admin);
  await admin.getByRole("link", { name: "Team Member" }).first().click();
  await admin.waitForURL(/\/admin\/users\/[^/]+$/);
  await settled(admin);
}

test("RBAC: custom role + several roles, admin console, user management, plugin upload", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const companyName = `RBAC Co ${Date.now()}`;
  const base = await setupCompany(page, { email: uniqueEmail("rbac-owner"), legalName: companyName, gstin: makeGstin("27") });
  const memberEmail = uniqueEmail("rbac-member");
  const uploadId = `e2e-up-${Date.now().toString(36)}`;
  const admin = await adminPage(browser);
  const memberCtx = await browser.newContext();
  const member = await memberCtx.newPage();

  await test.step("owner creates a custom role and invites a member with Staff + that role", async () => {
    await page.goto(`${base}/settings/roles`);
    await settled(page);
    await page.getByRole("button", { name: "+ New role" }).click();
    await page.getByLabel("Role name").fill("Collections");
    await page.getByRole("checkbox", { name: /^See payments/ }).check();
    await page.getByRole("checkbox", { name: /^Record and delete payments/ }).check();
    await page.getByRole("button", { name: "Create role" }).click();
    await expect(page.getByText("Collections", { exact: true })).toBeVisible();

    await page.goto(`${base}/settings/users`);
    await settled(page);
    await page.getByLabel("Email").fill(memberEmail);
    await page.getByRole("group", { name: "Invite roles" }).getByRole("checkbox", { name: /Collections/ }).click();
    await page.getByRole("button", { name: "Send invite" }).click();
    const link = (await page.locator("code", { hasText: "/invite/" }).textContent())!.trim();

    await signUp(member, "Team Member", memberEmail);
    await member.waitForURL("**/onboarding");
    await member.goto(new URL(link).pathname);
    await settled(member);
    await member.getByRole("button", { name: "Accept invitation" }).click();
    await member.waitForURL(`**${base}/dashboard`);
  });

  await test.step("the member gets the union: payments (custom role) but not reports or settings", async () => {
    await expect(member.getByRole("link", { name: "Payments" })).toBeVisible();
    await expect(member.getByRole("link", { name: "Reports" })).toHaveCount(0);
    await expect(member.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await member.goto(`${base}/payments`);
    await expect(member.getByRole("heading", { name: "Payments" })).toBeVisible();
    await member.goto(`${base}/reports`);
    await member.waitForURL(/dashboard\?denied=1/);
  });

  await test.step("admin overview shows KPIs and charts; system page loads", async () => {
    await admin.goto("/admin");
    await expect(admin.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(admin.getByText("Invoices issued")).toBeVisible();
    await expect(admin.getByRole("img", { name: /Sales value per month/ })).toBeVisible();
    await admin.goto("/admin/system");
    await expect(admin.getByRole("heading", { name: "Event delivery" })).toBeVisible();
  });

  await test.step("admin disables the member (signed out, can't sign in), then enables and sets a temporary password", async () => {
    await openUser(admin, memberEmail);
    admin.once("dialog", (d) => d.accept());
    await admin.getByRole("button", { name: "Disable account" }).click();
    await expect(admin.getByText("Account disabled and signed out")).toBeVisible();

    await member.goto(`${base}/dashboard`);
    await member.waitForURL(/\/login/);
    await signIn(member, memberEmail);
    await expect(member.getByRole("alert").filter({ hasText: /disabled/i })).toBeVisible();

    await admin.getByRole("button", { name: "Enable account" }).click();
    await expect(admin.getByText("Account enabled")).toBeVisible();
    await admin.getByLabel("Temporary password").fill("TempPass#2026");
    await admin.getByRole("button", { name: "Set password" }).click();
    await expect(admin.getByText(/Temporary password set/)).toBeVisible();

    await signIn(member, memberEmail, "TempPass#2026");
    await member.waitForURL(`**${base}/dashboard`);
  });

  await test.step("a Support admin can open users but not plugins", async () => {
    await openUser(admin, memberEmail);
    await admin.getByRole("group", { name: "Admin roles" }).getByRole("checkbox", { name: /^Support/ }).check();
    await admin.getByRole("button", { name: "Save admin roles" }).click();
    await expect(admin.getByText("Admin roles updated")).toBeVisible();

    await member.goto("/admin/users");
    await expect(member.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(member.getByRole("link", { name: "Plugins" })).toHaveCount(0);
    expect((await member.request.get("/admin/plugins", { maxRedirects: 0 })).status()).toBe(404);

    await admin.getByRole("group", { name: "Admin roles" }).getByRole("checkbox", { name: /^Support/ }).uncheck();
    await admin.getByRole("button", { name: "Save admin roles" }).click();
    await expect(admin.getByText("Admin access removed")).toBeVisible();
    expect((await member.request.get("/admin", { maxRedirects: 0 })).status()).toBe(404);
  });

  try {
    await test.step("admin uploads a packed plugin, installs it for this company, and its widget renders", async () => {
      execFileSync(process.execPath, ["scripts/pack-plugin.mjs", "invoice-footer", "--id", uploadId], { stdio: "pipe" });
      await admin.goto("/admin/plugins");
      await settled(admin);
      await admin.getByLabel("Plugin file").setInputFiles(join(process.cwd(), "dist-plugins", `${uploadId}-1.0.0.mygst-plugin.js`));
      await admin.getByRole("button", { name: "Check file" }).click();
      const dialog = admin.getByRole("dialog", { name: `Upload Invoice footer (${uploadId})` });
      await expect(dialog).toContainText(/SHA-256 [0-9a-f]{64}/);
      await dialog.getByRole("button", { name: "Upload plugin" }).click();
      await admin.waitForURL(`**/admin/plugins/${uploadId}`);
      await settled(admin);
      await expect(admin.getByText("Uploaded code")).toBeVisible();

      await admin.getByRole("button", { name: "Install", exact: true }).click();
      const install = admin.getByRole("dialog", { name: `Install Invoice footer (${uploadId})` });
      await install.getByLabel(/^Selected companies/).check();
      await install.getByRole("button", { name: "Install plugin" }).click();
      await expect(admin.getByText("Installed", { exact: true }).first()).toBeVisible();
      await admin.goto(`/admin/plugins/${uploadId}?q=${encodeURIComponent(companyName)}`);
      await settled(admin);
      await admin.getByRole("row", { name: new RegExp(companyName) }).first().getByRole("button", { name: "Allow" }).click();
      await expect(admin.getByRole("row", { name: new RegExp(companyName) }).first()).toContainText("Active");

      await page.goto(`${base}/dashboard`);
      await expect(page.getByTestId(`widget-${uploadId}:this-month`)).toContainText("invoiced since");
    });
  } finally {
    await admin.goto(`/admin/plugins/${uploadId}`);
    await settled(admin);
    if (await admin.getByRole("button", { name: "Uninstall" }).count()) {
      admin.once("dialog", (d) => d.accept());
      await admin.getByRole("button", { name: "Uninstall" }).click();
      await admin.waitForURL("**/admin/plugins");
    }
    await memberCtx.close();
    await admin.context().close();
  }
});
