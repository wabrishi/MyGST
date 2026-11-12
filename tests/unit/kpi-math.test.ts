import { describe, expect, it } from "vitest";
import { daysBetween, dso, fmtPct, growthPct, prevMonthKey, ratePct, weightedAgeDays } from "@/lib/reports/kpi-math";

describe("KPI math", () => {
  it("growth", () => {
    expect(growthPct(120, 100)).toBe(20);
    expect(growthPct(50, 100)).toBe(-50);
    expect(growthPct(100, 0)).toBeNull(); // no baseline
  });

  it("rates", () => {
    expect(ratePct(25, 100)).toBe(25);
    expect(ratePct(5, 0)).toBeNull();
    expect(fmtPct(12.345, 1)).toBe("12.3%");
    expect(fmtPct(null)).toBe("—");
  });

  it("days sales outstanding", () => {
    // ₹50k outstanding on ₹3L of sales over 180 days -> 30 days
    expect(dso(50_000_00, 300_000_00, 180)).toBe(30);
    expect(dso(10, 0, 30)).toBeNull();
  });

  it("average receivable age is weighted by unpaid amount", () => {
    const today = "2026-11-30";
    // ₹100 outstanding 30 days + ₹300 outstanding 10 days -> (100·30 + 300·10) / 400 = 15
    expect(weightedAgeDays([{ date: "2026-10-31", balance: 100 }, { date: "2026-11-20", balance: 300 }], today)).toBe(15);
    expect(weightedAgeDays([{ date: "2026-11-30", balance: 500 }], today)).toBe(0); // raised today
    expect(weightedAgeDays([], today)).toBeNull();
  });

  it("day counts are inclusive and capped", () => {
    expect(daysBetween("2026-04-01", "2026-04-30")).toBe(30);
    expect(daysBetween("2026-04-01", "2027-03-31", "2026-04-10")).toBe(10); // FY so far
    expect(daysBetween("2026-04-01", "2027-03-31", "2026-03-01")).toBe(0); // cap before start
  });

  it("previous month rolls over the year", () => {
    expect(prevMonthKey("2027-01-15")).toBe("2026-12");
    expect(prevMonthKey("2026-11-12")).toBe("2026-10");
  });
});
