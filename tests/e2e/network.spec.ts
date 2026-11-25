import { expect, test, type Browser } from "@playwright/test";
import { addParty, addProduct, createDoc, makeGstin, setupCompany, signIn, signUp, uniqueEmail } from "./helpers";

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

test("an invoice from company A reaches company B, which adds it to its purchases", async ({ browser }) => {
  test.setTimeout(240_000);
  const gA = makeGstin("27");
  const gB = makeGstin("29");
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const baseA = await setupCompany(a, { email: uniqueEmail("net-a"), legalName: "Alpha Sellers", gstin: gA });
  const baseB = await setupCompany(b, { email: uniqueEmail("net-b"), legalName: "Beta Buyers", gstin: gB });

  let invoicePath = "";
  await test.step("A invoices B (B is a customer with B's GSTIN)", async () => {
    await addParty(a, baseA, { name: "Beta Buyers", gstin: gB, state: "29" });
    await a.goto(`${baseA}/parties`);
    await a.getByRole("link", { name: "Beta Buyers" }).click();
    await expect(a.getByText(/On MyGSTBook ✓ as Beta Buyers/)).toBeVisible();
    await addProduct(a, baseA, { name: "Office chair", hsn: "9401", price: "4000", gst: "18" });
    invoicePath = await createDoc(a, baseA, "invoices", "Beta Buyers", "Office chair", "3");
    await expect(a.getByTestId("share-status")).toContainText("Shared with Beta Buyers on MyGSTBook");
    await expect(a.getByTestId("share-status")).toContainText("not opened yet");
  });

  await test.step("B finds it in Received and adds it to purchases", async () => {
    await b.goto(`${baseB}/dashboard`);
    await expect(b.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: /Received/ })).toContainText("1");
    await b.goto(`${baseB}/received`);
    await b.getByRole("link", { name: /^Invoice INV\// }).click();
    await expect(b.getByRole("heading", { name: /Invoice INV\// })).toBeVisible();
    await expect(b.getByText("Office chair")).toBeVisible();
    const number = (await b.getByRole("heading", { name: /Invoice INV\// }).textContent())!.replace("Invoice ", "").trim();
    expect((await b.request.get(`${new URL(b.url()).pathname}/pdf`)).headers()["content-type"]).toBe("application/pdf");

    await b.getByRole("button", { name: "Add to purchases" }).click();
    await b.waitForURL(/\/purchases\/new\?received=/);
    await expect(b.getByText(/Adding invoice .* from Alpha Sellers/)).toBeVisible();
    await expect(b.getByLabel("Supplier invoice no.")).toHaveValue(number);
    await b.getByRole("button", { name: "Save purchase invoice" }).click();
    await b.waitForURL(/\/purchases\/(?!new)[^/?]+$/);

    await b.goto(`${baseB}/received?status=ACCEPTED`);
    await expect(b.getByRole("table").getByText("In your books")).toBeVisible();
  });

  await test.step("A sees that B added it", async () => {
    await a.goto(invoicePath);
    await expect(a.getByTestId("share-status")).toContainText("added to their books");
  });
});

test("super admin edits an email template, previews, tests and resets it", async ({ browser }) => {
  const admin = await adminPage(browser);
  await admin.goto("/admin/emails");
  await admin.getByRole("link", { name: "Invitation to a customer or supplier" }).click();
  // Start from the default (a previous run may have left an edit).
  const resetFirst = admin.getByRole("button", { name: "Reset to default…" });
  if (await resetFirst.isEnabled()) {
    await resetFirst.click();
    await admin.getByRole("button", { name: "Reset to default", exact: true }).click();
    await expect(admin.getByLabel("Subject")).toHaveValue("{{companyName}} invites you to {{brand}}");
  }
  const subject = admin.getByLabel("Subject");
  await subject.fill("{{companyName}} wants to work with you on {{brand}}");
  await expect(admin.getByText("Sharma Traders wants to work with you on MyGSTBook")).toBeVisible(); // live preview
  await subject.fill("Bad {{nope}}");
  await expect(admin.getByText("Unknown variable: {{nope}}")).toBeVisible();
  await subject.fill("{{companyName}} wants to work with you on {{brand}}");
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await expect(admin.getByText(/Template saved/)).toBeVisible();
  await admin.getByRole("button", { name: "Send test", exact: true }).click();
  await expect(admin.getByText(/Test sent|printed in the server log/)).toBeVisible();

  await admin.goto("/admin/emails");
  await expect(admin.getByRole("row", { name: /Invitation to a customer/ })).toContainText("Edited");
  await admin.getByRole("link", { name: "Invitation to a customer or supplier" }).click();
  await admin.getByRole("button", { name: "Reset to default…" }).click();
  await admin.getByRole("button", { name: "Reset to default", exact: true }).click();
  await expect(admin.getByLabel("Subject")).toHaveValue("{{companyName}} invites you to {{brand}}");
});

test("adding a party with an email invites them once", async ({ page }) => {
  const base = await setupCompany(page, { email: uniqueEmail("inviter"), legalName: "Inviting Co", gstin: makeGstin("27") });
  const email = uniqueEmail("invited-party");
  await page.goto(`${base}/parties/new`);
  await expect(page.getByLabel(/Invite to MyGSTBook/)).toBeChecked();
  await page.getByLabel("Name").fill("Friendly Shop");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`We've invited ${email} to MyGSTBook`)).toBeVisible();
  await page.getByRole("link", { name: "Friendly Shop" }).click();
  await expect(page.getByText(/Invited to MyGSTBook on/)).toBeVisible();
});
