import { spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { addParty, addProduct, createDoc, makeGstin, setupCompany, signIn, signUp, uniqueEmail } from "./helpers";

/** Must match SUPER_ADMIN_EMAILS in the server's .env. */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@e2e.test";
const EXT_PORT = 4199;
const EXT_DATA = join(process.cwd(), "examples", "external-plugin", "data.json");
const settled = (page: Page) => page.waitForLoadState("networkidle");

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

/** Uninstalls a plugin from its admin page if it's installed (CODE: also deletes its data). */
async function ensureUninstalled(admin: Page, pluginId: string) {
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

async function install(admin: Page, pluginName: string, opts: { defaultOn: boolean; availability: string }) {
  await admin.goto("/admin/plugins");
  await settled(admin);
  const row = admin.getByRole("row", { name: new RegExp(pluginName) });
  await row.getByRole("button", { name: "Install", exact: true }).click();
  const dialog = admin.getByRole("dialog", { name: `Install ${pluginName}` });
  await dialog.getByLabel(opts.defaultOn ? /Yes, on by default/ : /No, owners turn it on/).check();
  await dialog.getByLabel(new RegExp(`^${opts.availability}`)).check();
  await dialog.getByRole("button", { name: "Install plugin" }).click();
  await expect(row.getByText("Installed", { exact: true })).toBeVisible();
}

test("plugins: super-admin install & availability, owner on/off & settings, external plugin", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const admin = await adminPage(browser);
  const companyName = `Plugin Owner ${Date.now()}`;
  const base = await setupCompany(page, { email: uniqueEmail("plugin-owner"), legalName: companyName, gstin: makeGstin("27") });
  const widget = page.getByTestId("widget-invoice-footer:this-month");

  await test.step("admin installs Invoice footer: on by default, all companies", async () => {
    await ensureUninstalled(admin, "invoice-footer");
    await install(admin, "Invoice footer", { defaultOn: true, availability: "All companies" });
  });

  await test.step("owner sees it already on: dashboard widget + settings", async () => {
    await page.goto(`${base}/dashboard`);
    await expect(widget).toBeVisible();
    await expect(widget).toContainText("invoiced since");
    await page.goto(`${base}/settings/plugins`);
    await settled(page);
    await expect(page.getByRole("switch", { name: "Invoice footer on" })).toBeVisible();
    await page.getByLabel("Footer message").fill("Thanks from the E2E plugin test");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
  });

  await test.step("invoice PDF still renders with the plugin section", async () => {
    await addParty(page, base, { name: "Plugin Buyer", state: "27" });
    await addProduct(page, base, { name: "Plugin Service", hsn: "998311", price: "1000", gst: "18" });
    const docPath = await createDoc(page, base, "invoices", "Plugin Buyer", "Plugin Service");
    const pdf = await page.request.get(`${docPath}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
  });

  await test.step("admin: Selected companies without this one hides it; All brings it back", async () => {
    await admin.goto("/admin/plugins/invoice-footer");
    await settled(admin);
    await admin.getByLabel(/^Selected companies/).check();
    await expect(admin.getByText(/Saved\./)).toBeVisible();
    await page.goto(`${base}/dashboard`);
    await expect(page.getByRole("heading", { name: /./ }).first()).toBeVisible();
    await expect(widget).toHaveCount(0);

    // Allow just this company.
    await admin.goto(`/admin/plugins/invoice-footer?q=${encodeURIComponent(companyName)}`);
    await settled(admin);
    await admin.getByRole("row", { name: new RegExp(companyName) }).first().getByRole("button", { name: "Allow" }).click();
    await expect(admin.getByRole("row", { name: new RegExp(companyName) }).first()).toContainText("Active");
    await page.goto(`${base}/dashboard`);
    await expect(widget).toBeVisible();

    await admin.getByLabel(/^All companies/).check();
    await expect(admin.getByText(/Saved\./)).toBeVisible();
  });

  await test.step("owner turns it off; widget disappears", async () => {
    await page.goto(`${base}/settings/plugins`);
    await settled(page);
    await page.getByRole("switch", { name: "Invoice footer on" }).click();
    await expect(page.getByRole("switch", { name: "Invoice footer off" })).toBeVisible();
    await page.goto(`${base}/dashboard`);
    await expect(page.getByRole("heading", { name: /./ }).first()).toBeVisible();
    await expect(widget).toHaveCount(0);
  });

  await test.step("non-admins can't reach the plugin admin", async () => {
    const res = await page.request.get("/admin/plugins", { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });

  let ext: ChildProcess | null = null;
  try {
    await test.step("external plugin: load by URL, install, page opens in a frame with a verified token", async () => {
      rmSync(EXT_DATA, { force: true });
      ext = spawn(process.execPath, ["examples/external-plugin/server.mjs"], { env: { ...process.env, PORT: String(EXT_PORT) }, stdio: "pipe" });
      await expect.poll(async () => (await fetch(`http://localhost:${EXT_PORT}/manifest.json`).catch(() => null))?.status ?? 0, { timeout: 15_000 }).toBe(200);

      await ensureUninstalled(admin, "event-log");
      await admin.goto("/admin/plugins");
      await settled(admin);
      await admin.getByLabel("Manifest URL").fill(`http://localhost:${EXT_PORT}/manifest.json`);
      await admin.getByRole("button", { name: "Load plugin" }).click();
      await admin.waitForURL("**/admin/plugins/event-log");
      await settled(admin);
      await admin.getByRole("button", { name: "Install", exact: true }).click();
      const dialog = admin.getByRole("dialog", { name: "Install Event log (example)" });
      await dialog.getByLabel(/^Selected companies/).check();
      await dialog.getByRole("button", { name: "Install plugin" }).click();
      await expect(admin.getByText("Installed", { exact: true }).first()).toBeVisible();
      await admin.goto(`/admin/plugins/event-log?q=${encodeURIComponent(companyName)}`);
      await settled(admin);
      await admin.getByRole("row", { name: new RegExp(companyName) }).first().getByRole("button", { name: "Allow" }).click();
      await expect(admin.getByRole("row", { name: new RegExp(companyName) }).first()).toContainText("Active");

      await page.goto(`${base}/dashboard`);
      await page.getByRole("link", { name: "Event log" }).first().click();
      await page.waitForURL(`**${base}/apps/event-log/events`);
      const frame = page.frameLocator('iframe[title="Event log (example): Event log"]');
      await expect(frame.getByText(/Signed in as E2E Owner \(OWNER\)/)).toBeVisible();
    });
  } finally {
    await ensureUninstalled(admin, "event-log").catch(() => {});
    (ext as ChildProcess | null)?.kill();
    rmSync(EXT_DATA, { force: true });
    await ensureUninstalled(admin, "invoice-footer").catch(() => {});
    await admin.context().close();
  }
});
