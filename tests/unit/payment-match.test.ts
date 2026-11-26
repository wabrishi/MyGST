import { describe, expect, it } from "vitest";
import { rankMatches } from "@/lib/payment-match";

const row = (id: string, date: string, amount: number) => ({ id, date, amount, mode: "BANK", reference: "" });

describe("matching a received payment with one already recorded", () => {
  const target = { date: "2026-11-20", amount: 500000 };

  it("puts same-amount payments first, then the nearest date", () => {
    const r = rankMatches([row("near-diff", "2026-11-20", 499000), row("far-same", "2026-11-27", 500000), row("near-same", "2026-11-18", 500000)], target, new Set());
    expect(r.map((x) => x.id)).toEqual(["near-same", "far-same", "near-diff"]);
    expect(r[2]).toMatchObject({ sameAmount: false, difference: -1000 });
  });

  it("leaves out payments already matched and those outside the date window", () => {
    const r = rankMatches([row("used", "2026-11-20", 500000), row("old", "2026-10-01", 500000), row("ok", "2026-11-30", 500000)], target, new Set(["used"]));
    expect(r.map((x) => x.id)).toEqual(["ok"]);
  });

  it("shows at most five", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`p${i}`, "2026-11-20", 500000));
    expect(rankMatches(rows, target, new Set())).toHaveLength(5);
  });
});
