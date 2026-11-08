import type { Budget } from "@finance/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BudgetAnalyticsService } from "../src/budgets/budget-analytics-service";
import { BudgetMatcher } from "../src/budgets/budget-matcher";
import { PeriodCalculator } from "../src/budgets/period-calculator";
import { Keys } from "../src/keys";
import { addAccount, createHarness, TABLES, USER, type Harness } from "./support/harness";

const budget = (b: Partial<Budget>): Budget => ({
  id: "b1",
  name: "Test",
  categoryIds: [],
  tagIds: [],
  period: "MONTHLY",
  limitCents: 10000,
  version: 1,
  ...b,
});

describe("PeriodCalculator", () => {
  const pc = new PeriodCalculator();
  it("starts weeks on the user's week-start day", () => {
    // 2026-10-14 is a Wednesday
    expect(pc.periodStart("2026-10-14", budget({ period: "WEEKLY" }), "MONDAY")).toBe("2026-10-12");
    expect(pc.periodStart("2026-10-14", budget({ period: "WEEKLY" }), "SUNDAY")).toBe("2026-10-11");
    expect(pc.periodStart("2026-10-11", budget({ period: "WEEKLY" }), "MONDAY")).toBe("2026-10-05");
  });

  it("handles months, quarters, years, and custom ranges", () => {
    expect(pc.periodStart("2026-10-14", budget({ period: "MONTHLY" }))).toBe("2026-10-01");
    expect(pc.periodStart("2026-11-14", budget({ period: "QUARTERLY" }))).toBe("2026-10-01");
    expect(pc.periodStart("2026-02-01", budget({ period: "QUARTERLY" }))).toBe("2026-01-01");
    expect(pc.periodStart("2026-10-14", budget({ period: "YEARLY" }))).toBe("2026-01-01");
    const custom = budget({ period: "CUSTOM", startDate: "2026-10-10", endDate: "2026-10-20" });
    expect(pc.periodStart("2026-10-14", custom)).toBe("2026-10-10");
    expect(pc.periodStart("2026-10-21", custom)).toBeNull();
    expect(pc.daysInPeriod("2026-10-10", custom)).toBe(11);
  });

  it("lists the current period and earlier ones, oldest first", () => {
    expect(pc.periods(budget({ period: "MONTHLY" }), 3, "2026-01-15")).toEqual(["2025-11-01", "2025-12-01", "2026-01-01"]);
    expect(pc.periods(budget({ period: "WEEKLY" }), 2, "2026-10-14", "MONDAY")).toEqual(["2026-10-05", "2026-10-12"]);
    expect(pc.daysInPeriod("2026-02-01", budget({ period: "MONTHLY" }))).toBe(28);
  });
});

describe("BudgetMatcher", () => {
  const m = new BudgetMatcher();
  const txn = { kind: "purchase" as const, categoryId: "groceries", tagIds: ["university"], localDate: "2026-10-14" };
  it("matches on category and any of the tags", () => {
    expect(m.matches(txn, budget({ categoryIds: ["groceries"] }))).toBe(true);
    expect(m.matches(txn, budget({ tagIds: ["hobbies", "university"] }))).toBe(true);
    expect(m.matches(txn, budget({ categoryIds: ["groceries"], tagIds: ["hobbies"] }))).toBe(false);
    expect(m.matches(txn, budget({ categoryIds: ["transport"] }))).toBe(false);
  });
  it("never matches income, transfers, or card payments", () => {
    for (const kind of ["income", "transfer", "card_payment"] as const) expect(m.matches({ ...txn, kind }, budget({ tagIds: ["university"] }))).toBe(false);
  });
  it("returns the period key of each match", () => {
    expect(m.matching(txn, [budget({ id: "w", period: "WEEKLY", tagIds: ["university"] })], "MONDAY")).toEqual([
      { budgetId: "w", periodStart: "2026-10-12", limitCents: 10000 },
    ]);
  });
});

describe("BudgetAnalyticsService.proportion", () => {
  it("reports percent above 100 and the amount over", () => {
    expect(BudgetAnalyticsService.proportion(13600, 9000)).toEqual({ spentCents: 13600, limitCents: 9000, remainingCents: -4600, percent: 151, overByCents: 4600 });
    expect(BudgetAnalyticsService.proportion(4500, 9000)).toMatchObject({ percent: 50, overByCents: 0, remainingCents: 4500 });
  });
});

describe("BudgetService with backfill, progress, and burn-down", () => {
  let h: Harness;
  beforeEach(async () => {
    h = createHarness({ now: "2026-10-20T15:00:00Z" });
    await addAccount(h, { currency: "USD" });
  });
  afterEach(() => h.restore());

  async function spend(localDate: string, amountMinor: number, tagIds: string[] = ["university"]) {
    return h.services.transactionService().create(USER, { accountId: "acc-main", kind: "purchase", amountMinor, localDate, categoryId: "groceries", tagIds });
  }

  it("backfills a new budget from existing transactions and keeps it current on new ones", async () => {
    await spend("2026-09-03", 5000);
    await spend("2026-10-02", 12000);
    await spend("2026-10-05", 3000, []);
    const b = await h.services.budgetService().create(USER, { name: "University", categoryIds: [], tagIds: ["university"], period: "MONTHLY", limitCents: 30000 });
    expect(h.dynamo.item(TABLES.AGGREGATES_TABLE, Keys.user(USER), Keys.budgetPeriod(b.id, "2026-09-01"))).toMatchObject({ spentCents: 5000, count: 1 });
    expect(h.dynamo.item(TABLES.AGGREGATES_TABLE, Keys.user(USER), Keys.budgetPeriod(b.id, "2026-10-01"))).toMatchObject({ spentCents: 12000, limitCents: 30000 });

    await spend("2026-10-18", 16600);
    const [progress] = await h.services.budgetAnalyticsService().progress(USER);
    expect(progress).toMatchObject({ spentCents: 28600, limitCents: 30000, remainingCents: 1400, percent: 95, overByCents: 0 });

    const burndown = await h.services.budgetAnalyticsService().burndown(USER, b.id);
    expect(burndown.dates[0]).toBe("2026-10-01");
    expect(burndown.dates.at(-1)).toBe("2026-10-20");
    expect(burndown.cumulativeSpentCents[1]).toBe(12000);
    expect(burndown.cumulativeSpentCents.at(-1)).toBe(28600);
    expect(burndown.paceCents[0]).toBe(Math.round(30000 / 31));
  });

  it("rebuilds the rollups when the period changes, and rejects a stale version", async () => {
    await spend("2026-10-13", 1000);
    await spend("2026-10-19", 2000);
    const b = await h.services.budgetService().create(USER, { name: "Groceries", categoryIds: ["groceries"], tagIds: [], period: "MONTHLY", limitCents: 9000 });
    const weekly = await h.services.budgetService().update(USER, b.id, { period: "WEEKLY", version: 1 });
    expect(weekly.version).toBe(2);
    expect(h.dynamo.item(TABLES.AGGREGATES_TABLE, Keys.user(USER), Keys.budgetPeriod(b.id, "2026-10-01"))).toBeUndefined();
    expect(h.dynamo.item(TABLES.AGGREGATES_TABLE, Keys.user(USER), Keys.budgetPeriod(b.id, "2026-10-12"))).toMatchObject({ spentCents: 1000 });
    expect(h.dynamo.item(TABLES.AGGREGATES_TABLE, Keys.user(USER), Keys.budgetPeriod(b.id, "2026-10-19"))).toMatchObject({ spentCents: 2000 });
    await expect(h.services.budgetService().update(USER, b.id, { period: "YEARLY", version: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects budgets on unknown categories or tags", async () => {
    await expect(
      h.services.budgetService().create(USER, { name: "X", categoryIds: ["nope"], tagIds: [], period: "MONTHLY", limitCents: 100 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
