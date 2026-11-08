import { describe, expect, it } from "vitest";
import { RollupPlanner } from "../src/transactions/rollup-planner";

const planner = new RollupPlanner();
const base = { localDate: "2026-10-14", amountUsdCents: 2740, categoryId: "groceries", tagIds: ["university"] };
const byKey = (deltas: ReturnType<RollupPlanner["plan"]>) => Object.fromEntries(deltas.map((d) => [d.key, d]));

describe("RollupPlanner", () => {
  it("adds a purchase to day, month, category, tag, and budget items", () => {
    const deltas = byKey(
      planner.plan(null, { ...base, kind: "purchase" }, [], [{ budgetId: "b1", periodStart: "2026-10-01", limitCents: 30000 }]),
    );
    expect(deltas["DAY#2026-10-14#TOTAL"]).toMatchObject({ expenseCents: 2740, incomeCents: 0, count: 1 });
    expect(deltas["MONTH#2026-10#TOTAL"]).toMatchObject({ expenseCents: 2740, count: 1 });
    expect(deltas["MONTH#2026-10#CAT#groceries"]).toMatchObject({ expenseCents: 2740 });
    expect(deltas["MONTH#2026-10#TAG#university"]).toMatchObject({ expenseCents: 2740 });
    expect(deltas["BUDGET#b1#P#2026-10-01"]).toMatchObject({ expenseCents: 2740, count: 1, limitCents: 30000 });
    expect(deltas["BUDGET#b1#D#2026-10-14"]).toMatchObject({ expenseCents: 2740 });
  });

  it("puts uncategorized spending in its own category bucket", () => {
    const deltas = byKey(planner.plan(null, { ...base, categoryId: undefined, tagIds: [], kind: "purchase" }));
    expect(deltas["MONTH#2026-10#CAT#uncategorized"]).toMatchObject({ expenseCents: 2740 });
  });

  it("counts income only in incomeCents and never in budgets", () => {
    const deltas = planner.plan(null, { ...base, kind: "income" }, [], [{ budgetId: "b1", periodStart: "2026-10-01", limitCents: 1 }]);
    expect(deltas.every((d) => d.expenseCents === 0)).toBe(true);
    expect(deltas.some((d) => d.key.startsWith("BUDGET#"))).toBe(false);
    expect(byKey(deltas)["MONTH#2026-10#TOTAL"]).toMatchObject({ incomeCents: 2740, count: 1 });
  });

  it("keeps transfers and card payments out of every rollup", () => {
    expect(planner.plan(null, { ...base, kind: "transfer" })).toEqual([]);
    expect(planner.plan(null, { ...base, kind: "card_payment" })).toEqual([]);
  });

  it("subtracts refunds from spending", () => {
    const deltas = byKey(planner.plan(null, { ...base, kind: "refund" }));
    expect(deltas["MONTH#2026-10#TOTAL"].expenseCents).toBe(-2740);
  });

  it("moves the amount between categories and tags on an edit and leaves totals untouched", () => {
    const deltas = byKey(
      planner.plan({ ...base, kind: "purchase" }, { ...base, kind: "purchase", categoryId: "eating-out", tagIds: ["hobbies"] }),
    );
    expect(deltas["MONTH#2026-10#TOTAL"]).toBeUndefined();
    expect(deltas["DAY#2026-10-14#TOTAL"]).toBeUndefined();
    expect(deltas["MONTH#2026-10#CAT#groceries"]).toMatchObject({ expenseCents: -2740, count: -1 });
    expect(deltas["MONTH#2026-10#CAT#eating-out"]).toMatchObject({ expenseCents: 2740, count: 1 });
    expect(deltas["MONTH#2026-10#TAG#university"]).toMatchObject({ expenseCents: -2740 });
    expect(deltas["MONTH#2026-10#TAG#hobbies"]).toMatchObject({ expenseCents: 2740 });
  });

  it("removes every contribution on a delete", () => {
    const deltas = planner.plan({ ...base, kind: "purchase" }, null, [{ budgetId: "b1", periodStart: "2026-10-01", limitCents: 100 }], []);
    expect(deltas.every((d) => d.expenseCents === -2740)).toBe(true);
    expect(deltas).toHaveLength(6);
  });

  it("counts a transaction with two tags in both tag totals", () => {
    const deltas = byKey(planner.plan(null, { ...base, kind: "purchase", tagIds: ["university", "hobbies"] }));
    expect(deltas["MONTH#2026-10#TAG#university"].expenseCents).toBe(2740);
    expect(deltas["MONTH#2026-10#TAG#hobbies"].expenseCents).toBe(2740);
  });
});
