import { describe, expect, it } from "vitest";
import { billedPercent, derivePoStatus, isOverdue, remainingQty } from "@/lib/po-status";

describe("purchase order billing maths", () => {
  it("remaining quantity never goes negative and survives float noise", () => {
    expect(remainingQty(10, 4)).toBe(6);
    expect(remainingQty(10, 12)).toBe(0);
    expect(remainingQty(0.3, 0.1 + 0.2)).toBe(0); // 0.1 + 0.2 = 0.30000000000000004
    expect(remainingQty(1.5, 0.25)).toBe(1.25);
  });

  it("status follows the billed quantities", () => {
    const lines = (...b: number[]) => b.map((billedQty) => ({ qty: 10, billedQty }));
    expect(derivePoStatus("OPEN", lines(0, 0))).toBe("OPEN");
    expect(derivePoStatus("OPEN", lines(4, 0))).toBe("PARTIAL");
    expect(derivePoStatus("PARTIAL", lines(10, 10))).toBe("BILLED");
    expect(derivePoStatus("BILLED", lines(10, 3))).toBe("PARTIAL"); // an invoice was cancelled
    expect(derivePoStatus("BILLED", lines(0, 0))).toBe("OPEN");
  });

  it("closed and cancelled are decisions and are kept", () => {
    expect(derivePoStatus("CLOSED", [{ qty: 10, billedQty: 10 }])).toBe("CLOSED");
    expect(derivePoStatus("CANCELLED", [{ qty: 10, billedQty: 0 }])).toBe("CANCELLED");
  });

  it("billed percent caps over-billed lines and handles empty orders", () => {
    expect(billedPercent([{ qty: 10, billedQty: 5 }, { qty: 10, billedQty: 0 }])).toBe(25);
    expect(billedPercent([{ qty: 10, billedQty: 15 }])).toBe(100);
    expect(billedPercent([])).toBe(0);
  });

  it("only open or partly billed orders past their date are overdue", () => {
    expect(isOverdue("OPEN", "2026-11-01", "2026-11-18")).toBe(true);
    expect(isOverdue("PARTIAL", "2026-11-01", "2026-11-18")).toBe(true);
    expect(isOverdue("OPEN", "2026-11-18", "2026-11-18")).toBe(false);
    expect(isOverdue("BILLED", "2026-11-01", "2026-11-18")).toBe(false);
    expect(isOverdue("OPEN", null, "2026-11-18")).toBe(false);
  });
});
