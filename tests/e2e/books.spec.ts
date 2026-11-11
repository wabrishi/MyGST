import { expect, test, type Page } from "@playwright/test";
import { addParty, addProduct, createDoc, makeGstin, setupCompany, signUp, summaryValue, uniqueEmail } from "./helpers";

const settled = (page: Page) => page.waitForLoadState("networkidle");

test("payments, purchases/ITC, reports, FY lock, roles and tenant isolation", async ({ page, browser }) => {
  let base = "";
  let invoicePath = "";

  await test.step("setup", async () => {
    base = await setupCompany(page, { email: uniqueEmail("books"), legalName: "Books Pvt Ltd", gstin: makeGstin("27") });
    await addParty(page, base, { name: "Pune Traders", state: "27" });
    await addParty(page, base, { name: "Supply Co", gstin: makeGstin("27"), type: "SUPPLIER" });
    await addProduct(page, base, { name: "Gadget", hsn: "8517", price: "1000", gst: "18" });
    invoicePath = await createDoc(page, base, "invoices", "Pune Traders", "Gadget", "1");
    expect(await summaryValue(page, "Total")).toBe("₹1,180.00");
  });

  await test.step("partial then full payment", async () => {
    await page.getByRole("link", { name: "Record payment" }).click();
    await settled(page);
    await expect(page.getByRole("spinbutton", { name: "Amount (₹)" })).toHaveValue("1180.00");
    await page.getByRole("spinbutton", { name: "Amount (₹)" }).fill("500");
    await page.getByRole("spinbutton", { name: /Allocate to INV/ }).fill("500");
    await page.getByRole("button", { name: "Save payment" }).click();
    await page.waitForURL(/\/payments\/(?!new)[^/]+$/);

    await page.goto(invoicePath);
    expect(await summaryValue(page, "Balance")).toBe("₹680.00");
    await expect(page.getByText("Partly paid")).toBeVisible();

    await page.getByRole("link", { name: "Record payment" }).click();
    await settled(page);
    await expect(page.getByRole("spinbutton", { name: "Amount (₹)" })).toHaveValue("680.00");
    await page.getByRole("button", { name: "Save payment" }).click();
    await page.waitForURL(/\/payments\/(?!new)[^/]+$/);
    await page.goto(invoicePath);
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  });

  await test.step("purchase bill feeds ITC into GSTR-3B", async () => {
    await page.goto(`${base}/purchases/new`);
    await settled(page);
    const sup = page.getByRole("combobox", { name: "Supplier" });
    const labels = await sup.locator("option").allTextContents();
    await sup.selectOption({ label: labels.find((l) => l.startsWith("Supply Co"))! });
    await page.getByLabel("Supplier bill no.").fill("S-101");
    await page.getByRole("combobox", { name: "Line 1 product" }).selectOption({ label: "Gadget" });
    await page.getByRole("spinbutton", { name: "Line 1 rate" }).fill("500");
    await page.getByRole("button", { name: "Save bill" }).click();
    await page.waitForURL(/\/purchases\/(?!new)[^/]+$/);
    expect(await summaryValue(page, "Total")).toBe("₹590.00");

    await page.goto(`${base}/reports/gstr3b`);
    await expect(page.getByRole("row", { name: /ITC available/ })).toContainText("₹45.00");
    await expect(page.getByRole("row", { name: /Net payable/ })).toContainText("₹45.00"); // CGST 90 − 45
  });

  await test.step("GSTR-1 and ledger", async () => {
    await page.goto(`${base}/reports/gstr1`);
    await expect(page.getByRole("heading", { name: "B2C Small (7)" })).toBeVisible();
    const res = await page.request.get(`${base}/reports/csv?report=gstr1&section=b2cs`);
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("Type,Place Of Supply,Applicable % of Tax Rate,Rate,Taxable Value");
    expect(csv).toContain("OE,27-Maharashtra,,18,1000.00");

    await page.goto(`${base}/reports/ledger`);
    await settled(page);
    await page.getByRole("combobox", { name: "Party" }).selectOption({ label: "Pune Traders" });
    await expect(page.getByRole("row", { name: /Closing balance/ })).toContainText("₹0.00");
  });

  await test.step("closed financial year is read-only", async () => {
    // An invoice in the previous FY makes that year appear; then close it.
    await page.goto(`${base}/invoices/new`);
    await settled(page);
    await page.getByRole("combobox", { name: "Party" }).selectOption({ label: "Pune Traders" });
    await page.getByRole("textbox", { name: "Date", exact: true }).fill("2025-06-15");
    await page.getByRole("combobox", { name: "Line 1 product" }).selectOption({ label: "Gadget" });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/\/invoices\/(?!new)[^/]+$/);
    await expect(page.getByRole("heading", { name: /INV\/25-26\/0001/ })).toBeVisible();

    await page.goto(`${base}/settings/financial-years`);
    await settled(page);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("row", { name: /FY 2025-26/ }).getByRole("button", { name: "Close year" }).click();
    await expect(page.getByRole("row", { name: /FY 2025-26/ })).toContainText("Closed");

    await page.goto(`${base}/invoices/new`);
    await settled(page);
    await page.getByRole("combobox", { name: "Party" }).selectOption({ label: "Pune Traders" });
    await page.getByRole("textbox", { name: "Date", exact: true }).fill("2026-01-10");
    await page.getByRole("combobox", { name: "Line 1 product" }).selectOption({ label: "Gadget" });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/Books are closed up to 2026-03-31/)).toBeVisible();

    // FY switcher: viewing the closed year shows a read-only banner.
    await page.goto(`${base}/dashboard`);
    await settled(page);
    const fySelect = page.getByRole("combobox", { name: "Financial year" }).first();
    await fySelect.selectOption("25-26");
    await expect(page.getByText(/You are viewing FY 2025-26.*closed/)).toBeVisible();
    await fySelect.selectOption({ index: 0 });
    await expect(page.getByText(/You are viewing FY/)).toHaveCount(0);
  });

  let inviteLink = "";
  const staffEmail = uniqueEmail("staff");
  await test.step("owner invites staff", async () => {
    await page.goto(`${base}/settings/users`);
    await settled(page);
    await page.getByLabel("Email").fill(staffEmail);
    await page.getByRole("button", { name: "Send invite" }).click();
    const code = page.locator("code", { hasText: "/invite/" });
    await expect(code).toBeVisible();
    inviteLink = (await code.textContent())!.trim();
  });

  await test.step("staff joins and is restricted", async () => {
    const ctx = await browser.newContext();
    const staff = await ctx.newPage();
    await signUp(staff, "Staff Member", staffEmail);
    await staff.waitForURL("**/onboarding");
    await staff.goto(new URL(inviteLink).pathname);
    await settled(staff);
    await staff.getByRole("button", { name: "Accept invitation" }).click();
    await staff.waitForURL(`**${base}/dashboard`);
    await expect(staff.getByRole("link", { name: "Reports" })).toHaveCount(0);
    await expect(staff.getByRole("link", { name: "Settings" })).toHaveCount(0);

    await staff.goto(`${base}/invoices`);
    await expect(staff.getByText(/No invoices in this period/)).toBeVisible(); // staff see only their own

    await staff.goto(`${base}/settings/company`);
    await staff.waitForURL(/dashboard\?denied=1/);
    await expect(staff.getByText(/permission to open that page/)).toBeVisible();
    const csv = await staff.request.get(`${base}/reports/csv?report=sales`);
    expect(csv.status()).toBe(403);
    await ctx.close();
  });

  const otherEmail = uniqueEmail("other");
  await test.step("another tenant can't see this company's data", async () => {
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await setupCompany(other, { email: otherEmail, legalName: "Other Co", gstin: makeGstin("29") });
    for (const path of [invoicePath, `${invoicePath}/pdf`, `${base}/reports/csv?report=sales`, `${base}/dashboard`]) {
      const res = await other.request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(404);
    }
    await ctx.close();
  });

  await test.step("each user belongs to only one company", async () => {
    // The owner can't create a second company.
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "You already have a company" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create company" })).toHaveCount(0);

    // A person who already belongs to another company can't be invited (any role).
    await page.goto(`${base}/settings/users`);
    await settled(page);
    await page.getByLabel("Email").fill(otherEmail);
    await page.getByRole("combobox", { name: "Role" }).selectOption("STAFF");
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByText(/already belongs to another company/)).toBeVisible();
  });
});
