import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { contactSchema, RATE_LIMIT } from "@/lib/contact";
import { RateLimited, saveContactMessage } from "@/lib/contact-store";
import { db } from "@/lib/db";

/** Website contact messages against the real database. */
describe("contact messages", () => {
  const ip = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const input = contactSchema.parse({ name: "Ravi", email: "ravi@test.local", phone: "98765 43210", topic: "support", message: "I need help with my invoices." });

  afterAll(async () => {
    await db.contactMessage.deleteMany({ where: { ip } });
    await db.$disconnect();
  });

  it("saves messages and limits each IP to 5 an hour", async () => {
    for (let i = 0; i < RATE_LIMIT.max; i++) await saveContactMessage(input, { ip, userAgent: "vitest" });
    const saved = await db.contactMessage.findMany({ where: { ip } });
    expect(saved).toHaveLength(RATE_LIMIT.max);
    expect(saved[0]).toMatchObject({ name: "Ravi", email: "ravi@test.local", phone: "+919876543210", topic: "support", readAt: null, userAgent: "vitest" });
    await expect(saveContactMessage(input, { ip, userAgent: "vitest" })).rejects.toBeInstanceOf(RateLimited);
    expect(await db.contactMessage.count({ where: { ip } })).toBe(RATE_LIMIT.max);
  });
});
