import { expect, test } from "@playwright/test";
import { makeGstin, setupCompany, uniqueEmail } from "./helpers";

test("top bar '+ Add new' menu lists everything an owner can create", async ({ page }) => {
  const base = await setupCompany(page, { email: uniqueEmail("addnew-owner"), legalName: "Add New Co", gstin: makeGstin("27") });
  await page.goto(`${base}/dashboard`);

  const button = page.getByRole("button", { name: "Add new" });
  await button.click();
  const menu = page.getByRole("menu", { name: "Add new" });
  await expect(menu).toBeVisible();
  const items = await menu.getByRole("menuitem").allTextContents();
  expect(items).toEqual(["Invoice", "Quotation", "Credit note", "Debit note", "Payment", "Purchase order", "Purchase invoice", "Customer / supplier", "Product / service"]);

  // Keyboard: Escape closes it.
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await button.click();
  await menu.getByRole("menuitem", { name: "Purchase order" }).click();
  await page.waitForURL(`**${base}/purchase-orders/new`);
  await expect(page.getByRole("menu", { name: "Add new" })).toBeHidden();

  await page.getByRole("button", { name: "Add new" }).click();
  await page.getByRole("menuitem", { name: "Quotation" }).click();
  await page.waitForURL(`**${base}/quotations/new`);
});
