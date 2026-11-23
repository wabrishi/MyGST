import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, runTx } from "@/lib/db";
import { cancelDocument, saveDocument } from "@/lib/documents";
import { renderEmail } from "@/lib/email-render";
import { todayIST } from "@/lib/gst/fy";
import { inviteParty, markInviteJoined } from "@/lib/party-invites";
import { savePurchaseOrder } from "@/lib/purchase-orders";
import { savePurchase } from "@/lib/purchases";
import { counterpartyFor, loadReceived } from "@/lib/sharing";
import type { CompanyContext } from "@/lib/tenant";
import { memberContext } from "./helpers";

/** Documents between companies on MyGSTBook (by GSTIN), party invitations and email templates. */
describe("MyGSTBook network", () => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const gst = (state: string) => `${state}${String(Math.floor(Math.random() * 1e9)).padStart(9, "0").slice(0, 5).replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)])}${String(Math.floor(Math.random() * 1e4)).padStart(4, "0")}A1Z${"0123456789"[Math.floor(Math.random() * 10)]}`;
  const gA = gst("27");
  const gB = gst("29");
  const users: string[] = [];
  const companies: string[] = [];
  const emails: string[] = [];
  let A: CompanyContext;
  let B: CompanyContext;

  const company = async (tag: string, gstin: string, stateCode: string) => {
    const u = await db.user.create({ data: { id: `net-${tag}-${stamp}`, name: `Owner ${tag}`, email: `net-${tag}-${stamp}@test.local` } });
    users.push(u.id);
    const c = await db.company.create({ data: { legalName: `${tag} Traders ${stamp}`, gstin, stateCode, address: "Main road" } });
    companies.push(c.id);
    return memberContext(u, c);
  };
  const line = (description: string, qty: number, rate: number) => ({ description, qty, rate, gstRate: 18, hsnSac: "8471", unit: "NOS" });

  beforeAll(async () => {
    A = await company("A", gA, "27");
    B = await company("B", gB, "29");
  });

  afterAll(async () => {
    await db.partyInvite.deleteMany({ where: { email: { in: emails } } });
    for (const id of companies) {
      await db.sharedDocument.deleteMany({ where: { OR: [{ fromCompanyId: id }, { toCompanyId: id }] } });
      await db.paymentAllocation.deleteMany({ where: { purchaseBill: { companyId: id } } });
      await db.purchaseBill.deleteMany({ where: { companyId: id } });
      await db.purchaseOrder.deleteMany({ where: { companyId: id } });
      await db.document.deleteMany({ where: { companyId: id, originalDocId: { not: null } } });
      await db.document.deleteMany({ where: { companyId: id } });
    }
    await db.company.deleteMany({ where: { id: { in: companies } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.emailTemplate.deleteMany({ where: { key: "party_invite", updatedBy: `test-${stamp}` } });
    await db.$disconnect();
  });

  it("A's invoice to B's GSTIN arrives in B's inbox; edits and cancelling follow it", async () => {
    const custB = await db.party.create({ data: { companyId: A.companyId, name: "B as customer", gstin: gB, stateCode: "29" } });
    const doc = { partyId: custB.id, date: todayIST(), placeOfSupply: "29", items: [line("Laptop", 2, 50000)] };
    const invId = await saveDocument(A, "INVOICE", null, doc);
    let share = await db.sharedDocument.findFirstOrThrow({ where: { fromCompanyId: A.companyId, sourceId: invId } });
    expect(share).toMatchObject({ toCompanyId: B.companyId, kind: "INVOICE", status: "NEW", updatedBySender: false });
    const received = (await loadReceived(B.companyId, share.id))!;
    expect(received.snapshot.from.gstin).toBe(gA);
    expect(received.snapshot.items[0]).toMatchObject({ description: "Laptop", qty: 2, rate: 50000, gstRate: 18 });
    expect(received.snapshot.totals.igst).toBe(18000);
    expect(await loadReceived(A.companyId, share.id)).toBeNull(); // only the receiver opens it

    await saveDocument(A, "INVOICE", invId, { ...doc, items: [line("Laptop", 3, 50000)] });
    share = await db.sharedDocument.findUniqueOrThrow({ where: { id: share.id } });
    expect(share.updatedBySender).toBe(true);
    expect(share.total.toNumber()).toBe(177000);

    await cancelDocument(A, invId);
    expect((await db.sharedDocument.findUniqueOrThrow({ where: { id: share.id } })).status).toBe("WITHDRAWN");
  });

  it("B adds it to purchases: supplier created, share accepted and linked", async () => {
    const custB = await db.party.findFirstOrThrow({ where: { companyId: A.companyId, gstin: gB } });
    const invId = await saveDocument(A, "INVOICE", null, { partyId: custB.id, date: todayIST(), placeOfSupply: "29", items: [line("Mouse", 10, 500)] });
    const share = (await loadReceived(B.companyId, (await db.sharedDocument.findFirstOrThrow({ where: { sourceId: invId } })).id))!;

    const supplierId = await runTx((tx) => counterpartyFor(tx, B.companyId, share.snapshot.from, "SUPPLIER"));
    expect(await db.party.findUniqueOrThrow({ where: { id: supplierId } })).toMatchObject({ companyId: B.companyId, gstin: gA, type: "SUPPLIER", stateCode: "27" });
    expect(await runTx((tx) => counterpartyFor(tx, B.companyId, share.snapshot.from, "SUPPLIER"))).toBe(supplierId); // found again, not duplicated

    const billId = await savePurchase(B, null, {
      partyId: supplierId,
      billNumber: share.snapshot.number,
      billDate: share.snapshot.date,
      placeOfSupply: share.snapshot.placeOfSupply,
      receivedId: share.id,
      items: share.snapshot.items.map((i) => ({ description: i.description, hsnSac: i.hsnSac, unit: i.unit, qty: i.qty, rate: i.rate, gstRate: i.gstRate })),
    });
    expect(await db.sharedDocument.findUniqueOrThrow({ where: { id: share.id } })).toMatchObject({ status: "ACCEPTED", acceptedRefId: billId, actedBy: B.user.id });
    expect((await db.purchaseBill.findUniqueOrThrow({ where: { id: billId } })).grandTotal.toNumber()).toBe(5900);
  });

  it("B's purchase order to A arrives at A, which invoices it", async () => {
    const supA = await db.party.create({ data: { companyId: B.companyId, type: "SUPPLIER", name: "A as supplier", gstin: gA, stateCode: "27" } });
    const poId = await savePurchaseOrder(B, null, { partyId: supA.id, date: todayIST(), placeOfSupply: "29", items: [line("Keyboard", 5, 1000)] });
    const share = await db.sharedDocument.findFirstOrThrow({ where: { fromCompanyId: B.companyId, kind: "PURCHASE_ORDER", sourceId: poId } });
    expect(share.toCompanyId).toBe(A.companyId);

    const custB = await db.party.findFirstOrThrow({ where: { companyId: A.companyId, gstin: gB } });
    const invId = await saveDocument(A, "INVOICE", null, { partyId: custB.id, date: todayIST(), placeOfSupply: "29", receivedId: share.id, items: [line("Keyboard", 5, 1000)] });
    expect(await db.sharedDocument.findUniqueOrThrow({ where: { id: share.id } })).toMatchObject({ status: "ACCEPTED", acceptedRefId: invId });
  });

  it("nothing is shared when two companies have the same GSTIN", async () => {
    const C = await company("C", gB, "29"); // impostor / duplicate of B
    void C;
    const custB = await db.party.findFirstOrThrow({ where: { companyId: A.companyId, gstin: gB } });
    const invId = await saveDocument(A, "QUOTATION", null, { partyId: custB.id, date: todayIST(), placeOfSupply: "29", items: [line("Desk", 1, 9000)] });
    expect(await db.sharedDocument.count({ where: { sourceId: invId } })).toBe(0);
  });

  it("invites a party once, never one already on MyGSTBook", async () => {
    const email = `invitee-${stamp}@test.local`;
    emails.push(email, `other-${stamp}@test.local`);
    const party = { id: "p1", name: "New Shop", email, gstin: "" };
    expect(await inviteParty({ id: A.companyId, name: "A Traders" }, party)).toBe("sent");
    expect(await inviteParty({ id: B.companyId, name: "B Traders" }, party)).toBe("already-invited");
    expect(await inviteParty({ id: A.companyId, name: "A Traders" }, { ...party, email: "", gstin: "" })).toBe("no-email");
    expect(await inviteParty({ id: A.companyId, name: "A Traders" }, { id: "p2", name: "B", email: `other-${stamp}@test.local`, gstin: gA === gB ? "" : gB })).toBe("on-portal");
    expect(await inviteParty({ id: A.companyId, name: "A Traders" }, { id: "p3", name: "Owner A", email: `net-a-${stamp}@test.local`, gstin: "" })).toBe("on-portal");

    await markInviteJoined(email.toUpperCase());
    expect((await db.partyInvite.findUniqueOrThrow({ where: { email } })).joinedAt).not.toBeNull();
  });

  it("an edited template is used, and resetting brings back the default", async () => {
    const before = await db.emailTemplate.findUnique({ where: { key: "party_invite" } });
    if (before) return; // a real edit exists on this database; don't touch it
    await db.emailTemplate.create({ data: { key: "party_invite", subject: "Join us, {{partyName}}", body: "<p>Hi {{partyName}} from {{companyName}}</p>", updatedBy: `test-${stamp}` } });
    const edited = await renderEmail("party_invite", { partyName: "Ravi & Sons", companyName: "A" });
    expect(edited.subject).toBe("Join us, Ravi & Sons");
    expect(edited.html).toContain("<p>Hi Ravi &amp; Sons from A</p>");
    await db.emailTemplate.delete({ where: { key: "party_invite" } });
    expect((await renderEmail("party_invite", { partyName: "Ravi", companyName: "A" })).subject).toBe("A invites you to MyGSTBook");
  });
});
