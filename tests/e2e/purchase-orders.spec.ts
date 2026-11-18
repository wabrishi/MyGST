import { expect, test, type Page } from "@playwright/test";
import { addParty, addProduct, makeGstin, setupCompany, uniqueEmail } from "./helpers";

const settled = (page: Page) => page.waitForLoadState("networkidle");

test("purchase order: create, PDF, bill it in two purchase invoices", async ({ page }) => {
  test.setTimeout(240_000);
  const base = await setupCompany(page, { email: uniqueEmail("po-owner"), legalName: "PO Owner Co", gstin: makeGstin("27") });
  await addParty(page, base, { name: "Steel Supplier", state: "29", type: "SUPPLIER" });
  await addProduct(page, base, { name: "Steel rod", hsn: "7214", price: "250", gst: "18" });
  let poPath = "";

  await test.step("sidebar shows both purchase documents", async () => {
    await page.goto(`${base}/dashboard`);
    await expect(page.getByRole("link", { name: "Purchase orders", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Purchase invoices", exact: true })).toBeVisible();
  });

  await test.step("create a purchase order for 10 rods", async () => {
    await page.goto(`${base}/purchase-orders/new`);
    await settled(page);
    const sup = page.getByRole("combobox", { name: "Supplier" });
    const labels = await sup.locator("option").allTextContents();
    await sup.selectOption({ label: labels.find((l) => l.startsWith("Steel Supplier"))! });
    await page.getByLabel("Expected delivery").fill("2099-01-15");
    await page.getByRole("combobox", { name: "Line 1 product" }).selectOption({ label: "Steel rod" });
    await page.getByRole("spinbutton", { name: "Line 1 qty" }).fill("10");
    await page.getByRole("spinbutton", { name: "Line 1 rate" }).fill("200");
    await page.getByRole("button", { name: "Save purchase order" }).click();
    await page.waitForURL(/\/purchase-orders\/(?!new)[^/]+$/);
    poPath = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: /Purchase order PO\/\d\d-\d\d\/0001/ })).toBeVisible();
    await expect(page.getByText("Open", { exact: true })).toBeVisible();

    const pdf = await page.request.get(`${poPath}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
  });

  await test.step("bill 4 of 10: the order is partly billed", async () => {
    await page.getByRole("link", { name: "Create purchase invoice" }).click();
    await page.waitForURL(/\/purchases\/new\?po=/);
    await settled(page);
    await expect(page.getByText(/Billing purchase order/)).toBeVisible();
    await expect(page.getByText(/10 of 10 NOS left/)).toBeVisible();
    await page.getByLabel("Supplier invoice no.").fill("SS-1");
    await page.getByRole("spinbutton", { name: "Line 1 qty" }).fill("4");
    await page.getByRole("button", { name: "Save purchase invoice" }).click();
    await page.waitForURL(/\/purchases\/(?!new)[^/?]+$/);
    await expect(page.getByRole("link", { name: /PO\/\d\d-\d\d\/0001/ })).toBeVisible();

    await page.goto(poPath);
    await expect(page.getByText("Partly billed", { exact: true })).toBeVisible();
    await expect(page.getByRole("row", { name: /Steel rod/ })).toContainText("6");
  });

  await test.step("bill the remaining 6: the order is billed", async () => {
    await page.getByRole("link", { name: "Create purchase invoice" }).click();
    await page.waitForURL(/\/purchases\/new\?po=/);
    await settled(page);
    await expect(page.getByRole("spinbutton", { name: "Line 1 qty" })).toHaveValue("6");
    await page.getByLabel("Supplier invoice no.").fill("SS-2");
    await page.getByRole("button", { name: "Save purchase invoice" }).click();
    await page.waitForURL(/\/purchases\/(?!new)[^/?]+$/);

    await page.goto(poPath);
    await expect(page.getByText("Billed", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Create purchase invoice" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "SS-1" })).toBeVisible();
    await expect(page.getByRole("link", { name: "SS-2" })).toBeVisible();
  });

  await test.step("the purchase orders list shows it as billed", async () => {
    await page.goto(`${base}/purchase-orders?status=BILLED`);
    await expect(page.getByRole("link", { name: /PO\/\d\d-\d\d\/0001/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Steel Supplier/ })).toContainText("100%");
  });
});
