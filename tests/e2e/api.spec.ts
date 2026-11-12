import { expect, test } from "@playwright/test";
import { makeGstin, setupCompany, uniqueEmail } from "./helpers";

test("suite API: keys, endpoints, idempotency, errors, revocation", async ({ page, request }) => {
  const base = await setupCompany(page, { email: uniqueEmail("api-owner"), legalName: "API Owner Co", gstin: makeGstin("27") });
  const companyId = base.split("/").pop()!;
  let key = "";

  await test.step("owner creates a key (shown once)", async () => {
    await page.goto(`${base}/settings/api-keys`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Key name").fill("Lead Manager");
    await page.getByRole("button", { name: "Create API key" }).click();
    key = (await page.getByTestId("new-api-key").textContent())!.trim();
    expect(key).toMatch(/^mgk_/);
    await page.reload();
    await expect(page.getByTestId("new-api-key")).toHaveCount(0); // never shown again
    await expect(page.getByRole("row", { name: /Lead Manager/ })).toContainText("Active");
  });

  const auth = () => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Suite-Workspace": "ws_ignored" });

  await test.step("rejects missing/invalid keys with JSON errors", async () => {
    const none = await request.post("/api/v1/parties/upsert", { data: { name: "x" } });
    expect(none.status()).toBe(401);
    expect(await none.json()).toEqual({ error: expect.stringMatching(/API key/) });
    const bad = await request.post("/api/v1/parties/upsert", { headers: { Authorization: "Bearer mgk_" + "x".repeat(43) }, data: { name: "x" } });
    expect(bad.status()).toBe(401);
    const invalid = await request.post("/api/v1/parties/upsert", { headers: auth(), data: { name: "" } });
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).error).toMatch(/name/);
  });

  let partyId = "";
  let quote: { id: string; number: string; url: string; total: number };

  await test.step("upsert party, create quotation, list by leadRef", async () => {
    const p = await request.post("/api/v1/parties/upsert", {
      headers: auth(),
      data: { name: "Asha Traders", phone: "919812345678", email: "asha@example.com", gstin: "", stateCode: "", billingAddress: "Pune", externalRef: "lead:abc" },
    });
    expect(p.status()).toBe(201);
    partyId = (await p.json()).id;
    const again = await request.post("/api/v1/parties/upsert", { headers: auth(), data: { name: "Asha", phone: "919812345678" } });
    expect(again.status()).toBe(200);
    expect((await again.json()).id).toBe(partyId);

    const q = await request.post("/api/v1/quotations", {
      headers: { ...auth(), "Idempotency-Key": "idem-1" },
      data: { partyId, items: [{ name: "Consulting", hsn: "998311", qty: 2, rate: 5000, gstRate: 18 }], notes: "From LM", leadRef: "abc" },
    });
    expect(q.status()).toBe(201);
    quote = await q.json();
    expect(quote).toEqual({ id: expect.any(String), number: expect.stringMatching(/^QT\//), url: expect.stringContaining(`/c/${companyId}/quotations/`), total: 11800 });

    // Same Idempotency-Key + route -> the first response, no second quotation.
    const replay = await request.post("/api/v1/quotations", {
      headers: { ...auth(), "Idempotency-Key": "idem-1" },
      data: { partyId, items: [{ name: "Consulting", qty: 2, rate: 5000, gstRate: 18 }], leadRef: "abc" },
    });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotent-replayed"]).toBe("true");
    expect((await replay.json()).id).toBe(quote.id);

    const list = await request.get("/api/v1/documents?leadRef=abc", { headers: auth() });
    expect(list.status()).toBe(200);
    expect(await list.json()).toEqual({
      data: [{ id: quote.id, kind: "QUOTATION", number: quote.number, total: 11800, status: "OPEN", url: quote.url, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }],
    });

    // The URL opens the quotation in MyGST for a signed-in member.
    await page.goto(new URL(quote.url).pathname);
    await expect(page.getByRole("heading", { name: new RegExp(`Quotation ${quote.number.replace(/\//g, "\\/")}`) })).toBeVisible();
  });

  await test.step("revoked keys stop working", async () => {
    await page.goto(`${base}/settings/api-keys`);
    await page.waitForLoadState("networkidle");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByRole("row", { name: /Lead Manager/ })).toContainText("Revoked");
    const res = await request.get("/api/v1/documents?leadRef=abc", { headers: auth() });
    expect(res.status()).toBe(401);
  });

  await test.step("integrations page saves the webhook and reveals a secret", async () => {
    await page.goto(`${base}/settings/integrations`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Lead Manager webhook URL").fill("http://leads.example.com/api/integrations/gst/tok");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/https/).first()).toBeVisible(); // http to a non-local host is rejected
    await page.getByLabel("Lead Manager webhook URL").fill("http://localhost:3010/api/integrations/gst/tok");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Webhook saved")).toBeVisible();
    await page.getByRole("button", { name: "Show secret" }).click();
    await expect(page.getByTestId("webhook-secret")).toHaveText(/^whsec_/);
  });
});
