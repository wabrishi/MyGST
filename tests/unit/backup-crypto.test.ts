import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, signState, verifyState } from "@/lib/backup/crypto";

beforeAll(() => {
  process.env.BACKUP_ENCRYPTION_KEY = "unit-test-key";
});

describe("backup secrets", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("1//refresh-token");
    const b = encryptSecret("1//refresh-token");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("1//refresh-token");
  });

  it("rejects tampered ciphertext", () => {
    const [iv, tag, data] = encryptSecret("secret").split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptSecret([iv, tag, flipped.toString("base64url")].join("."))).toThrow();
  });
});

describe("OAuth state", () => {
  it("verifies a valid state and rejects tampering", () => {
    const s = signState({ nonce: "n1", scope: "platform" });
    expect(verifyState(s)?.nonce).toBe("n1");
    const [body, sig] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ nonce: "n1", scope: "company", companyId: "x", exp: 9e9 })).toString("base64url");
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
    expect(verifyState(`${body}.AAAA`)).toBeNull();
  });

  it("expires", () => {
    expect(verifyState(signState({ nonce: "n" }, -1))).toBeNull();
  });
});
