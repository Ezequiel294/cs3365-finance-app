import { describe, expect, it } from "vitest";
import { addMonths, monthName, originalWithUsd, shortDate } from "../lib/format";

describe("web formatting (05-S01)", () => {
  it("shows the original amount first, then USD with the rate and its date", () => {
    expect(originalWithUsd({ currency: "CRC", amountMinor: 1_400_000, amountUsdCents: 2740, fxRate: 510.95, fxDate: "2026-10-14" })).toEqual({
      original: "₡14,000.00",
      converted: "$27.40 at 510.95 on Oct 14",
    });
    expect(originalWithUsd({ currency: "USD", amountMinor: 1200, amountUsdCents: 1200, fxRate: 1, fxDate: "2026-10-14" })).toEqual({ original: "$12.00" });
  });

  it("moves between months and names them", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(monthName("2026-10")).toBe("October 2026");
    expect(shortDate("2026-10-29")).toBe("Oct 29");
  });
});
