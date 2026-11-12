import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, looksLikeApiKey } from "@/lib/api/keys";
import { phoneDigits } from "@/lib/api/normalize";
import { BACKOFF_MS, newEventId, nextAttempt, signPayload, validateWebhookUrl } from "@/lib/events/signing";

describe("API keys", () => {
  it("are random, prefixed and stored only as a SHA-256 hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^mgk_[A-Za-z0-9_-]{43}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.prefix).toBe(a.key.slice(0, 12));
    expect(looksLikeApiKey(a.key)).toBe(true);
    expect(looksLikeApiKey("Bearer xyz")).toBe(false);
  });
});

describe("event signing", () => {
  it("is v1=HMAC-SHA256(secret, '<ts>.<body>') in hex", () => {
    const body = JSON.stringify({ id: "evt_1", type: "invoice.issued" });
    const expected = createHmac("sha256", "whsec_test").update(`1700000000.${body}`).digest("hex");
    expect(signPayload("whsec_test", 1700000000, body)).toBe(`v1=${expected}`);
    expect(signPayload("other", 1700000000, body)).not.toBe(`v1=${expected}`);
  });

  it("event ids are unique and prefixed", () => {
    const ids = new Set(Array.from({ length: 200 }, newEventId));
    expect(ids.size).toBe(200);
    expect([...ids].every((i) => i.startsWith("evt_"))).toBe(true);
  });

  it("retries after 1 m, 5 m, 30 m, 2 h, 12 h, then stops", () => {
    const now = 1_000_000;
    expect(BACKOFF_MS.map((_, i) => nextAttempt(i + 1, now)!.getTime() - now)).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]);
    expect(nextAttempt(6, now)).toBeNull();
  });
});

describe("webhook URL validation (non-production)", () => {
  it("accepts https and local http, rejects others", () => {
    expect(validateWebhookUrl("https://leads.example.com/api/integrations/gst/tok")).toBeNull();
    expect(validateWebhookUrl("http://localhost:3010/api/integrations/gst/tok")).toBeNull();
    expect(validateWebhookUrl("http://leads.example.com/x")).toMatch(/https/);
    expect(validateWebhookUrl("ftp://x")).not.toBeNull();
    expect(validateWebhookUrl("not a url")).toMatch(/valid URL/);
    expect(validateWebhookUrl("https://user:pass@leads.example.com/x")).toMatch(/Credentials/);
  });
});

describe("phone normalisation", () => {
  it("keeps digits only", () => {
    expect(phoneDigits("+91 98765-43210")).toBe("919876543210");
    expect(phoneDigits("919876543210")).toBe("919876543210");
  });
});
