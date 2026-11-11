import { expect, type Page } from "@playwright/test";
import { gstinCheckChar } from "../../src/lib/gst/gstin";

/** Builds a checksum-valid GSTIN for a state with a random PAN-like body. */
export function makeGstin(state: string) {
  const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const r = (s: string, n: number) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join("");
  const body = `${state}${r(L, 5)}${r("0123456789", 4)}${r(L, 1)}1Z`;
  return body + gstinCheckChar(body);
}

export const uniqueEmail = (tag: string) => `${tag}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@e2e.test`;

export async function signUp(page: Page, name: string, email: string, password = "password123") {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}

export async function signIn(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs up and creates a company; returns the company base path (/c/<id>). */
export async function setupCompany(page: Page, opts: { email: string; legalName: string; gstin: string }) {
  await signUp(page, "E2E Owner", opts.email);
  await page.waitForURL("**/onboarding");
  await page.getByLabel("Legal name").fill(opts.legalName);
  await page.getByLabel("GSTIN").fill(opts.gstin);
  await page.getByLabel("Address").fill("1 Test Street");
  await page.getByLabel("Bank name").fill("Test Bank");
  await page.getByLabel("Account number").fill("1234567890");
  await page.getByLabel("IFSC").fill("HDFC0001234");
  await page.getByRole("button", { name: "Create company" }).click();
  // New companies land on the setup wizard.
  await page.waitForURL(/\/c\/[^/]+\/setup/);
  return new URL(page.url()).pathname.replace(/\/setup$/, "");
}

export async function addParty(
  page: Page,
  base: string,
  p: { name: string; gstin?: string; state?: string; email?: string; type?: "CUSTOMER" | "SUPPLIER" | "BOTH" },
) {
  await page.goto(`${base}/parties/new`);
  await page.waitForLoadState("networkidle");
  if (p.type) await page.getByRole("combobox", { name: "Type" }).selectOption(p.type);
  await page.getByLabel("Name").fill(p.name);
  if (p.gstin) await page.getByLabel("GSTIN").fill(p.gstin);
  if (p.state) await page.getByRole("combobox", { name: "State", exact: true }).selectOption(p.state);
  if (p.email) await page.getByLabel("Email").fill(p.email);
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(`**${base}/parties`);
  await expect(page.getByRole("link", { name: p.name })).toBeVisible();
}

export async function addProduct(page: Page, base: string, p: { name: string; hsn: string; price: string; gst: string }) {
  await page.goto(`${base}/products/new`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill(p.name);
  await page.getByLabel("HSN / SAC code").fill(p.hsn);
  await page.getByLabel("Sale price (₹)").fill(p.price);
  await page.getByRole("combobox", { name: "GST rate (%)" }).selectOption(p.gst);
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(`**${base}/products`);
}

/** Creates a document with one product line; returns its view URL path. */
export async function createDoc(
  page: Page,
  base: string,
  kind: "invoices" | "quotations",
  partyName: string,
  productName: string,
  qty = "1",
) {
  await page.goto(`${base}/${kind}/new`);
  await page.waitForLoadState("networkidle");
  const partySelect = page.getByRole("combobox", { name: kind === "quotations" ? "Customer" : "Party" });
  await partySelect.selectOption({ label: await optionLabel(page, partySelect, partyName) });
  await page.locator("tbody select").first().selectOption({ label: productName });
  await page.locator('tbody input[type="number"]').first().fill(qty);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL(new RegExp(`${base}/${kind}/(?!new$)[^/]+$`));
  return new URL(page.url()).pathname;
}

async function optionLabel(page: Page, select: ReturnType<Page["locator"]>, startsWith: string) {
  const labels = await select.locator("option").allTextContents();
  const match = labels.find((l) => l.startsWith(startsWith));
  if (!match) throw new Error(`No option starting with ${startsWith}: ${labels.join(", ")}`);
  return match;
}

/** Reads a value from the summary card on a document view page (e.g. "Total"). */
export async function summaryValue(page: Page, label: string) {
  const dt = page.locator("dl dt", { hasText: new RegExp(`^${label}$`) }).first();
  return (await dt.locator("xpath=following-sibling::dd[1]").textContent())?.trim();
}
