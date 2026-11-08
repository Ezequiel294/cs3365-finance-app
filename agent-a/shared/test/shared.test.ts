import { describe, expect, it } from "vitest";
import {
  BrokerRule,
  countsAsSpending,
  formatMinor,
  NewBudget,
  NewInvestmentTransaction,
  NewTransaction,
  parseDecimalToMinor,
  parseQuantityToMicro,
  formatQuantity,
} from "../src";

describe("shared schemas", () => {
  it("accepts a minimal manual entry and defaults kind and tags", () => {
    expect(NewTransaction.parse({ accountId: "acc-1", amountMinor: 500, localDate: "2026-10-14" })).toMatchObject({ kind: "purchase", tagIds: [] });
    expect(NewTransaction.safeParse({ accountId: "acc-1", amountMinor: 1.5, localDate: "2026-10-14" }).success).toBe(false);
    expect(NewTransaction.safeParse({ accountId: "acc-1", amountMinor: 5, localDate: "2026-02-30" }).success).toBe(false);
  });

  it("requires a category or tag on a budget and a range on a custom one", () => {
    expect(NewBudget.safeParse({ name: "x", period: "MONTHLY", limitCents: 100 }).success).toBe(false);
    expect(NewBudget.safeParse({ name: "x", tagIds: ["t"], period: "CUSTOM", limitCents: 100 }).success).toBe(false);
    expect(NewBudget.safeParse({ name: "x", tagIds: ["t"], period: "CUSTOM", limitCents: 100, startDate: "2026-10-01", endDate: "2026-10-31" }).success).toBe(true);
  });

  it("requires ticker, quantity, and gross on trades and an amount on cash movements", () => {
    expect(NewInvestmentTransaction.safeParse({ brokerId: "b", type: "BUY", localDate: "2026-10-01", ticker: "voo", quantityMicro: 1, grossCents: 1 }).data?.ticker).toBe("VOO");
    expect(NewInvestmentTransaction.safeParse({ brokerId: "b", type: "BUY", localDate: "2026-10-01" }).success).toBe(false);
    expect(NewInvestmentTransaction.safeParse({ brokerId: "b", type: "DEPOSIT", localDate: "2026-10-01" }).success).toBe(false);
    expect(BrokerRule.safeParse({ flatCents: -1, percentBps: 0, version: 1 }).success).toBe(false);
  });

  it("keeps transfers, card payments, and income out of spending", () => {
    expect(countsAsSpending("purchase")).toBe(true);
    expect(countsAsSpending("transfer")).toBe(false);
    expect(countsAsSpending("card_payment")).toBe(false);
    expect(countsAsSpending("income")).toBe(false);
  });
});

describe("money helpers", () => {
  it("formats and parses minor units without floating point", () => {
    expect(formatMinor(1_400_000, "CRC")).toBe("₡14,000.00");
    expect(formatMinor(-2740, "USD")).toBe("-$27.40");
    expect(parseDecimalToMinor("14,000")).toBe(1_400_000);
    expect(parseDecimalToMinor("27.4")).toBe(2740);
    expect(parseDecimalToMinor("1.234")).toBeNull();
    expect(parseQuantityToMicro("3.2155")).toBe(3_215_500);
    expect(formatQuantity(3_215_500)).toBe("3.2155");
  });
});
