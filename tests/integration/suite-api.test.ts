import "dotenv/config";
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createQuotation, documentsByLeadRef, upsertParty } from "@/lib/api/v1";
import { encryptSecret } from "@/lib/backup/crypto";
import { db } from "@/lib/db";
import { cancelDocument, saveDocument } from "@/lib/documents";
import { deliverPending } from "@/lib/events/outbox";
import { todayIST } from "@/lib/gst/fy";
import { savePayment } from "@/lib/payments";
import { gstinCheckChar } from "@/lib/gst/gstin";
import type { CompanyContext } from "@/lib/tenant";

/**
 * /api/v1 business logic + outbox events against the real database, with a local HTTP server
 * standing in for Lead Manager's webhook.
 */
describe("suite API and events", () => {
  let ctx: CompanyContext;
  let other: CompanyContext;
  let server: Server;
  let received: Array<{ headers: Record<string, string>; body: string }> = [];
  let failNext = 0;
  const SECRET = "whsec_integration_test";

  const makeCompany = async (name: string): Promise<CompanyContext> => {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const user = await db.user.create({ data: { id: `api-${stamp}`, name: "API Tester", email: `api-${stamp}@test.local` } });
    const company = await db.company.create({ data: { legalName: name, stateCode: "27" } });
    await db.membership.create({ data: { userId: user.id, companyId: company.id, role: "OWNER" } });
    return { user: { id: user.id, name: user.name, email: user.email }, companyId: company.id, role: "OWNER", company: { id: company.id, legalName: name, tradeName: "", stateCode: "27", gstin: "" } };
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers as Record<string, string>, body });
        if (failNext > 0) {
          failNext--;
          res.writeHead(500).end("boom");
        } else res.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;

    ctx = await makeCompany("API Co");
    other = await makeCompany("Other Co");
    await db.companyIntegration.create({
      data: { companyId: ctx.companyId, leadsWebhookUrl: `http://localhost:${port}/api/integrations/gst/tok`, webhookSecretEnc: encryptSecret(SECRET) },
    });
  });

  afterAll(async () => {
    server.close();
    for (const c of [ctx, other]) {
      const where = { companyId: c.companyId };
      await db.payment.deleteMany({ where });
      await db.document.deleteMany({ where: { ...where, originalDocId: { not: null } } });
      await db.document.updateMany({ where, data: { convertedToId: null } });
      await db.document.deleteMany({ where });
      await db.company.delete({ where: { id: c.companyId } });
      await db.user.delete({ where: { id: c.user.id } });
    }
    await db.$disconnect();
  });

  let partyId = "";

  it("upserts parties: creates, then matches by phone, GSTIN and externalRef", async () => {
    const created = await upsertParty(ctx, { name: "Asha Traders", phone: "919876543210", email: "ASHA@Example.com", gstin: "", stateCode: "", billingAddress: "Pune", externalRef: "lead:L1" });
    expect(created.created).toBe(true);
    partyId = created.id;
    const p = await db.party.findUniqueOrThrow({ where: { id: partyId } });
    expect(p).toMatchObject({ type: "CUSTOMER", phone: "919876543210", email: "asha@example.com", stateCode: "27", externalRef: "lead:L1" });

    // Same person, phone saved differently in MyGST: last 10 digits match.
    await db.party.update({ where: { id: partyId }, data: { phone: "98765 43210" } });
    expect((await upsertParty(ctx, { name: "Asha T.", phone: "919876543210" })).id).toBe(partyId);
    // externalRef match
    expect((await upsertParty(ctx, { name: "x", externalRef: "lead:L1" })).id).toBe(partyId);

    // GSTIN match wins and the GSTIN decides the state
    const kaGstin = "29AAPFU0939F1Z" + gstinCheckChar("29AAPFU0939F1Z");
    const g = await upsertParty(ctx, { name: "Karnataka Buyer", gstin: kaGstin });
    expect((await db.party.findUniqueOrThrow({ where: { id: g.id } })).stateCode).toBe("29");
    expect((await upsertParty(ctx, { name: "Different name", gstin: kaGstin.toLowerCase() })).id).toBe(g.id);

    await expect(upsertParty(ctx, { name: "Bad", gstin: "29AAPFU0939F1ZV" })).rejects.toThrow(/GSTIN/); // wrong check digit
    await expect(upsertParty(ctx, { name: "" })).rejects.toThrow();
  });

  it("creates a normal quotation with leadRef and emits quotation.created", async () => {
    const q = await createQuotation(ctx, {
      partyId,
      items: [{ name: "Website design", hsn: "998314", qty: 1, rate: 10000, gstRate: 18 }, { name: "Hosting", qty: 2, rate: 1500, gstRate: 18 }],
      notes: "From Lead Manager",
      leadRef: "L1",
    });
    expect(q.number).toMatch(/^QT\/\d\d-\d\d\/0001$/);
    expect(q.total).toBe(15340); // (10,000 + 3,000) × 1.18
    expect(q.url).toMatch(new RegExp(`/c/${ctx.companyId}/quotations/${q.id}$`));
    const doc = await db.document.findUniqueOrThrow({ where: { id: q.id } });
    expect(doc).toMatchObject({ type: "QUOTATION", status: "OPEN", externalRef: "L1", isInterstate: false });

    const ev = await db.outboxEvent.findFirstOrThrow({ where: { companyId: ctx.companyId, type: "quotation.created" } });
    expect(ev.envelope).toMatchObject({
      type: "quotation.created",
      source: "gst",
      workspaceId: ctx.companyId,
      data: { id: q.id, number: q.number, total: 15340, amount: 15340, status: "OPEN", leadRef: "L1", partyId, url: q.url },
    });

    // Other companies can't use this party
    await expect(createQuotation(other, { partyId, items: [{ name: "x", qty: 1, rate: 1, gstRate: 0 }] })).rejects.toThrow(/not found/);
  });

  it("converting, paying and cancelling emit events; documents follow the lead", async () => {
    const quote = await db.document.findFirstOrThrow({ where: { companyId: ctx.companyId, type: "QUOTATION" } });
    const invoiceId = await saveDocument(ctx, "INVOICE", null, {
      partyId,
      date: todayIST(),
      placeOfSupply: "27",
      sourceQuotationId: quote.id,
      items: [{ description: "Website design", qty: 1, rate: 10000, gstRate: 18 }],
    });
    const invoice = await db.document.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.externalRef).toBe("L1"); // inherited from the quotation

    await savePayment(ctx, { direction: "RECEIVED", partyId, date: todayIST(), amount: 5000, mode: "UPI", reference: "UTR123", allocations: [{ targetId: invoiceId, amount: 5000 }] });

    const docs = await documentsByLeadRef(ctx, "L1");
    expect(docs.map((d) => [d.kind, d.status])).toEqual(expect.arrayContaining([["QUOTATION", "CONVERTED"], ["INVOICE", "PARTIAL"]]));
    expect(docs.find((d) => d.kind === "INVOICE")).toMatchObject({ number: invoice.number, total: 11800, date: todayIST() });
    expect(await documentsByLeadRef(other, "L1")).toEqual([]); // scoped to the key's company

    const types = (await db.outboxEvent.findMany({ where: { companyId: ctx.companyId }, orderBy: { createdAt: "asc" } })).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["quotation.created", "invoice.issued", "quotation.converted", "payment.received"]));
    const pay = await db.outboxEvent.findFirstOrThrow({ where: { companyId: ctx.companyId, type: "payment.received" } });
    expect(pay.envelope).toMatchObject({ data: { amount: 5000, total: 5000, partyId, leadRef: "L1", number: "UTR123", invoiceIds: [invoiceId] } });

    // Cancelling requires removing the payment first; then invoice.cancelled is emitted.
    await db.payment.deleteMany({ where: { companyId: ctx.companyId } });
    await cancelDocument(ctx, invoiceId);
    const cancelled = await db.outboxEvent.findFirstOrThrow({ where: { companyId: ctx.companyId, type: "invoice.cancelled" } });
    expect(cancelled.envelope).toMatchObject({ data: { id: invoiceId, status: "CANCELLED", leadRef: "L1" } });

    // No webhook configured -> no events recorded for that company.
    const otherParty = await upsertParty(other, { name: "Other buyer" });
    await createQuotation(other, { partyId: otherParty.id, items: [{ name: "x", qty: 1, rate: 100, gstRate: 18 }] });
    expect(await db.outboxEvent.count({ where: { companyId: other.companyId } })).toBe(0);
  });

  it("delivers signed events, retries failures with backoff", async () => {
    received = [];
    failNext = 1; // first delivery attempt fails
    const first = await deliverPending({ companyId: ctx.companyId });
    expect(first.failed).toBe(1);
    expect(first.sent).toBe(first.due - 1);

    const pending = await db.outboxEvent.findFirstOrThrow({ where: { companyId: ctx.companyId, status: "PENDING" } });
    expect(pending.attempts).toBe(1);
    expect(pending.lastError).toMatch(/HTTP 500/);
    expect(pending.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 50_000); // ~1 minute later

    // Make it due now and deliver again.
    await db.outboxEvent.update({ where: { id: pending.id }, data: { nextAttemptAt: new Date() } });
    expect((await deliverPending({ companyId: ctx.companyId })).sent).toBe(1);
    expect(await db.outboxEvent.count({ where: { companyId: ctx.companyId, status: { not: "SENT" } } })).toBe(0);

    // Every request carries a valid signature over "<timestamp>.<raw body>".
    for (const r of received) {
      const ts = r.headers["x-suite-timestamp"];
      const expected = "v1=" + createHmac("sha256", SECRET).update(`${ts}.${r.body}`).digest("hex");
      expect(r.headers["x-suite-signature"]).toBe(expected);
      expect(JSON.parse(r.body).id).toBe(r.headers["x-suite-event-id"]);
      expect(Math.abs(Date.now() / 1000 - Number(ts))).toBeLessThan(60);
    }
  });
});
