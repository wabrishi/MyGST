import { expect, test } from "@playwright/test";
import { makeGstin, setupCompany, signIn, signUp, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@e2e.test";

/**
 * Google itself can't be exercised in CI; these checks cover everything around it:
 * pages, permissions, the "not configured" path and the cron endpoint's auth.
 * (The upload/retention logic is covered by tests/integration/backup.test.ts with a fake Drive.)
 */
test("backup settings, permissions and cron endpoint", async ({ page, browser, request }) => {
  let base = "";

  await test.step("owner sees the company Backup tab", async () => {
    base = await setupCompany(page, { email: uniqueEmail("backup-owner"), legalName: "Backup Owner Co", gstin: makeGstin("27") });
    await page.goto(`${base}/settings/backup`);
    await expect(page.getByRole("heading", { name: "Automatic backup to Google Drive" })).toBeVisible();
    await expect(page.getByText("Not connected")).toBeVisible();
    await expect(page.getByRole("link", { name: "Export all data" })).toBeVisible();
  });

  await test.step("connect explains when Google isn't configured", async () => {
    const companyId = base.split("/").pop()!;
    await page.goto(`/api/backup/google/connect?scope=company&companyId=${companyId}`);
    await page.waitForURL(/settings\/backup\?backup=(not-configured|error)/);
    // When GOOGLE_CLIENT_ID is set locally the browser goes to Google instead — both are fine outcomes.
  });

  await test.step("only owners/admins may connect a Drive", async () => {
    const companyId = base.split("/").pop()!;
    const ctx = await browser.newContext();
    const stranger = await ctx.newPage();
    await signUp(stranger, "Stranger", uniqueEmail("stranger"));
    await stranger.waitForURL("**/onboarding");
    const res = await stranger.request.get(`/api/backup/google/connect?scope=company&companyId=${companyId}`, { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    const plat = await stranger.request.get(`/api/backup/google/connect?scope=platform`, { maxRedirects: 0 });
    expect(plat.status()).toBe(404);
    await ctx.close();
  });

  await test.step("cron endpoint requires the secret", async () => {
    expect((await request.get("/api/cron/backup")).status()).toBe(401);
    expect((await request.get("/api/cron/backup", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
    if (process.env.CRON_SECRET) {
      const ok = await request.get("/api/cron/backup", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
      expect(ok.status()).toBe(200);
      expect(await ok.json()).toHaveProperty("ran");
    }
  });

  await test.step("super-admin sees platform backups page", async () => {
    const ctx = await browser.newContext();
    const admin = await ctx.newPage();
    await signIn(admin, ADMIN_EMAIL);
    await admin.waitForURL((u) => !u.pathname.startsWith("/login"));
    await admin.goto("/admin/backups");
    await expect(admin.getByRole("heading", { name: "Backups", exact: true })).toBeVisible();
    await expect(admin.getByText(/whole platform/)).toBeVisible();
    await expect(admin.getByText("/api/backup/google/callback")).toBeVisible();
    await ctx.close();
  });
});
