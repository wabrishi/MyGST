import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { db, runTx } from "@/lib/db";
import { allocateNumber } from "@/lib/numbering";

/** Runs against the dev database (DATABASE_URL). Creates and removes its own company. */
describe("document numbering under concurrency", () => {
  let companyId = "";

  afterAll(async () => {
    if (companyId) await db.company.delete({ where: { id: companyId } });
    await db.$disconnect();
  });

  it("allocates gap-free, unique numbers for 20 parallel transactions", async () => {
    companyId = (await db.company.create({ data: { legalName: "Concurrency Test", stateCode: "27" } })).id;

    const numbers = await Promise.all(
      Array.from({ length: 20 }, () => runTx((tx) => allocateNumber(tx, companyId, "INVOICE", "2026-11-11"))),
    );

    const seqs = numbers.map((n) => n.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(numbers.map((n) => n.number)).size).toBe(20);
    expect(numbers.every((n) => /^INV\/26-27\/\d{4}$/.test(n.number))).toBe(true);
  });

  it("rolled-back transactions release their number", async () => {
    await db
      .$transaction(async (tx) => {
        await allocateNumber(tx, companyId, "INVOICE", "2026-11-11");
        throw new Error("rollback");
      })
      .catch(() => {});
    const next = await runTx((tx) => allocateNumber(tx, companyId, "INVOICE", "2026-11-11"));
    expect(next.seq).toBe(21);
  });
});
