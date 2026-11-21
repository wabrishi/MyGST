import { expect, test, type Browser } from "@playwright/test";
import { signIn, signUp } from "./helpers";

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

test("public website: pages, mobile menu, pricing switch", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const pages: Array<[string, RegExp]> = [
    ["/", /GST-ready every day/],
    ["/features", /Everything a GST business needs/],
    ["/pricing", /Simple pricing that grows with you/],
    ["/about", /Making GST simple/],
    ["/contact", /We'd love to hear from you/],
  ];
  for (const [path, h1] of pages) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    await expect(page.getByRole("link", { name: "MyGSTBook home" }).first()).toBeVisible();
  }
  await expect(page.getByRole("navigation", { name: "Website" }).getByRole("link", { name: "Contact" })).toHaveAttribute("aria-current", "page");

  await page.goto("/pricing");
  await expect(page.getByTestId("price-business")).toContainText("₹499");
  await page.getByRole("radio", { name: /Yearly/ }).click();
  await expect(page.getByTestId("price-business")).toContainText("₹416");
  await expect(page.getByTestId("price-business")).toContainText("₹4,990 billed yearly");

  // Phone menu
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Website menu" }).getByRole("link", { name: "Features" }).click();
  await page.waitForURL("**/features");
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
});

test("contact message reaches Admin → Messages", async ({ browser }) => {
  const stamp = Date.now();
  const name = `E2E Visitor ${stamp}`;
  // A fresh address for each run, so the per-IP limit never trips.
  const visitor = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.${stamp % 250}.${(stamp >> 8) % 250}.${(stamp >> 16) % 250}` } })).newPage();
  await visitor.goto("/contact?topic=support");
  await visitor.getByLabel("Your name").fill(name);
  await visitor.getByLabel("Email").fill(`visitor.${stamp}@e2e.test`);
  await visitor.getByLabel("Mobile number").fill("98765 43210");
  await visitor.getByLabel("Message").fill("Hello, I would like help setting up my company.");
  await expect(visitor.getByLabel("What's it about?")).toHaveValue("support");
  await visitor.waitForTimeout(3_200); // the form refuses sends faster than 3 s
  await visitor.getByRole("button", { name: "Send message" }).click();
  await expect(visitor.getByRole("heading", { name: "Message sent" })).toBeVisible();

  const admin = await adminPage(browser);
  await admin.goto(`/admin/messages?q=${encodeURIComponent(name)}`);
  await expect(admin.getByRole("heading", { name })).toBeVisible();
  await expect(admin.getByRole("paragraph").filter({ hasText: "Hello, I would like help setting up my company." })).toBeVisible();
  await admin.getByRole("button", { name: "Mark read" }).click();
  await expect(admin.getByRole("button", { name: "Mark unread" })).toBeVisible();

  // Signed in: the website offers the app instead of Sign in.
  await admin.goto("/");
  await expect(admin.getByRole("link", { name: "Open app" }).first()).toBeVisible();
  await expect(admin.getByRole("banner").getByRole("link", { name: "Sign in" })).toHaveCount(0);
});
