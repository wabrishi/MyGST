import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isEntitled, limitOf, mapHubRole, monthStartIST, verifyHubSignature } from "@/lib/hub-rules";

const ent = (over: Record<string, unknown> = {}) => ({
  plan: "Basic",
  status: "ACTIVE",
  active: true,
  validUntil: "2026-12-01T00:00:00.000Z",
  accessUntil: "2026-12-04T00:00:00.000Z",
  limits: { users: 2, invoicesPerMonth: 300 },
  ...over,
});

describe("Hub entitlement rules", () => {
  const now = new Date("2026-12-02T00:00:00Z");

  it("local mode never blocks", () => {
    expect(isEntitled(null, now, false)).toBe(true);
  });

  it("hub mode: allowed until accessUntil (grace), blocked after, when cancelled or missing", () => {
    expect(isEntitled(ent(), now, true)).toBe(true); // past validUntil but inside grace
    expect(isEntitled(ent(), new Date("2026-12-05T00:00:00Z"), true)).toBe(false);
    expect(isEntitled(ent({ status: "CANCELLED" }), now, true)).toBe(false);
    expect(isEntitled(null, now, true)).toBe(false);
    expect(isEntitled(ent({ accessUntil: undefined }), now, true)).toBe(false); // falls back to validUntil
  });

  it("limits: number, -1 or missing = unlimited", () => {
    expect(limitOf(ent(), "invoicesPerMonth")).toBe(300);
    expect(limitOf(ent({ limits: { invoicesPerMonth: -1 } }), "invoicesPerMonth")).toBe(-1);
    expect(limitOf(ent({ limits: {} }), "users")).toBe(-1);
    expect(limitOf(null, "users")).toBe(-1);
  });

  it("maps Hub roles to MyGST roles", () => {
    expect(mapHubRole("OWNER")).toBe("OWNER");
    expect(mapHubRole("MANAGER")).toBe("ACCOUNTANT");
    expect(mapHubRole("MEMBER")).toBe("STAFF");
    expect(mapHubRole(undefined)).toBe("STAFF");
  });

  it("month start is midnight IST on the 1st", () => {
    // 31 Dec 20:00 UTC = 1 Jan 01:30 IST -> January
    expect(monthStartIST(new Date("2026-12-31T20:00:00Z")).toISOString()).toBe("2026-12-31T18:30:00.000Z");
    expect(monthStartIST(new Date("2026-12-15T10:00:00Z")).toISOString()).toBe("2026-11-30T18:30:00.000Z");
  });
});

describe("Hub event signatures", () => {
  const secret = "hub_secret";
  const body = '{"id":"evt_1"}';
  const ts = 1_800_000_000;
  const sig = "v1=" + createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

  it("accepts a valid signature inside 5 minutes", () => {
    expect(verifyHubSignature(secret, ts, body, sig, ts + 299)).toBe(true);
  });
  it("rejects stale, tampered, wrong-secret or unconfigured", () => {
    expect(verifyHubSignature(secret, ts, body, sig, ts + 301)).toBe(false);
    expect(verifyHubSignature(secret, ts, body + " ", sig, ts)).toBe(false);
    expect(verifyHubSignature("other", ts, body, sig, ts)).toBe(false);
    expect(verifyHubSignature("", ts, body, sig, ts)).toBe(false);
    expect(verifyHubSignature(secret, NaN, body, sig, ts)).toBe(false);
  });
});
