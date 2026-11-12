import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { addParty, addProduct, createDoc, makeGstin, setupCompany, summaryValue, uniqueEmail } from "./helpers";

test("sales flow: invoices, quotation, credit note", async ({ page }) => {
  let base = "";

  await test.step("owner signs up, creates company, masters", async () => {
    base = await setupCompany(page, { email: uniqueEmail("owner"), legalName: "Acme Traders", gstin: makeGstin("27") });
    await addParty(page, base, { name: "Mumbai Retail", state: "27" });
    await addParty(page, base, { name: "Bengaluru Corp", gstin: makeGstin("29") });
    await addProduct(page, base, { name: "Widget", hsn: "8471", price: "1000", gst: "18" });
  });

  await test.step("intra-state invoice uses CGST + SGST and renders PDF", async () => {
    const path = await createDoc(page, base, "invoices", "Mumbai Retail", "Widget", "2");
    await expect(page.getByRole("heading", { name: /Invoice INV\/\d\d-\d\d\/0001/ })).toBeVisible();
    expect(await summaryValue(page, "Taxable")).toBe("₹2,000.00");
    expect(await summaryValue(page, "Tax")).toBe("₹360.00");
    expect(await summaryValue(page, "Total")).toBe("₹2,360.00");

    const pdf = await page.request.get(`${path}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
    if (process.env.E2E_SAVE_PDF) writeFileSync(process.env.E2E_SAVE_PDF, await pdf.body());
  });

  await test.step("inter-state invoice uses IGST", async () => {
    await page.goto(`${base}/invoices/new`);
    await page.waitForLoadState("networkidle"); // let React hydrate before interacting
    const party = page.getByRole("combobox", { name: "Party" });
    const labels = await party.locator("option").allTextContents();
    await party.selectOption({ label: labels.find((l) => l.startsWith("Bengaluru Corp"))! });
    await expect(page.getByText("Inter-state → IGST")).toBeVisible();
    await page.locator("tbody select").first().selectOption({ label: "Widget" });
    await expect(page.locator("dl dt", { hasText: /^IGST$/ })).toBeVisible();
    await expect(page.locator("dl dt", { hasText: /^CGST$/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/\/invoices\/(?!new$)[^/]+$/);
    await expect(page.getByRole("heading", { name: /\/0002$/ })).toBeVisible();
    expect(await summaryValue(page, "Total")).toBe("₹1,180.00");
  });

  await test.step("quotation converts into invoice", async () => {
    await createDoc(page, base, "quotations", "Mumbai Retail", "Widget", "3");
    await expect(page.getByRole("heading", { name: /Quotation QT\// })).toBeVisible();
    await page.getByRole("link", { name: "Convert to invoice" }).click();
    await expect(page.getByText(/Converting quotation/)).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/\/invoices\/(?!new$)[^/]+$/);
    expect(await summaryValue(page, "Total")).toBe("₹3,540.00");
  });

  await test.step("credit note reduces invoice balance and can't exceed it", async () => {
    await page.goto(`${base}/invoices`);
    await page.getByRole("link", { name: /\/0001$/ }).click();
    await page.getByRole("link", { name: "Credit note", exact: true }).click();
    await expect(page.getByText(/Against invoice INV/)).toBeVisible();
    await page.waitForLoadState("networkidle");
    // Credit 1 of the 2 widgets.
    await page.locator('tbody input[type="number"]').first().fill("1");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/\/credit-notes\/(?!new$)[^/]+$/);
    expect(await summaryValue(page, "Total")).toBe("₹1,180.00");

    await page.getByRole("link", { name: /INV\/\d\d-\d\d\/0001/ }).click();
    expect(await summaryValue(page, "Balance")).toBe("₹1,180.00");

    // Attempt to over-credit: 5 widgets against a ₹1,180 remaining balance.
    await page.getByRole("link", { name: "Credit note", exact: true }).click();
    await expect(page.getByText(/Against invoice INV/)).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.locator('tbody input[type="number"]').first().fill("5");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/can't exceed the invoice value/)).toBeVisible();
  });
});
