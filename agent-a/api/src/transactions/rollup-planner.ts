import { countsAsSpending, expenseSign, UNCATEGORIZED_ID, type Transaction } from "@finance/shared";
import type { BudgetMatch } from "../budgets/budget-matcher";
import { Keys } from "../keys";
import type { RollupDelta } from "./rollup-delta";

type RollupTxn = Pick<Transaction, "kind" | "localDate" | "amountUsdCents" | "categoryId" | "tagIds">;

/**
 * All rollup arithmetic lives here, so spending totals and budgets cannot drift apart.
 * An edit is "subtract the old contribution, add the new one"; a create has no old transaction
 * and a delete has no new one.
 */
export class RollupPlanner {
  plan(
    oldTxn: RollupTxn | null | undefined,
    newTxn: RollupTxn | null | undefined,
    oldBudgets: BudgetMatch[] = [],
    newBudgets: BudgetMatch[] = [],
  ): RollupDelta[] {
    const deltas: RollupDelta[] = [];
    if (oldTxn) deltas.push(...this.spendingDeltas(oldTxn, -1), ...this.budgetDeltas(oldBudgets, oldTxn, -1));
    if (newTxn) deltas.push(...this.spendingDeltas(newTxn, 1), ...this.budgetDeltas(newBudgets, newTxn, 1));
    return combine(deltas);
  }

  private spendingDeltas(txn: RollupTxn, sign: 1 | -1): RollupDelta[] {
    let expense = 0;
    let income = 0;
    if (countsAsSpending(txn.kind)) expense = expenseSign(txn.kind) * txn.amountUsdCents * sign;
    else if (txn.kind === "income") income = txn.amountUsdCents * sign;
    else return []; // transfers and card payments stay out of spending rollups
    const month = txn.localDate.slice(0, 7);
    const keys = [
      Keys.day(txn.localDate),
      Keys.month(month, "TOTAL"),
      Keys.month(month, "CAT", txn.categoryId ?? UNCATEGORIZED_ID),
      ...[...new Set(txn.tagIds)].map((t) => Keys.month(month, "TAG", t)),
    ];
    return keys.map((key) => ({ key, expenseCents: expense, incomeCents: income, count: sign }));
  }

  private budgetDeltas(matches: BudgetMatch[], txn: RollupTxn, sign: 1 | -1): RollupDelta[] {
    if (!countsAsSpending(txn.kind)) return [];
    const spent = expenseSign(txn.kind) * txn.amountUsdCents * sign;
    return matches.flatMap((m) => [
      { key: Keys.budgetPeriod(m.budgetId, m.periodStart), expenseCents: spent, incomeCents: 0, count: sign, limitCents: m.limitCents },
      { key: Keys.budgetDay(m.budgetId, txn.localDate), expenseCents: spent, incomeCents: 0, count: 0 },
    ]);
  }
}

/** Sums deltas on the same key and drops the ones that net to nothing. */
function combine(deltas: RollupDelta[]): RollupDelta[] {
  const byKey = new Map<string, RollupDelta>();
  for (const d of deltas) {
    const prev = byKey.get(d.key);
    if (!prev) {
      byKey.set(d.key, { ...d });
      continue;
    }
    prev.expenseCents += d.expenseCents;
    prev.incomeCents += d.incomeCents;
    prev.count += d.count;
    if (d.limitCents !== undefined) prev.limitCents = d.limitCents;
  }
  return [...byKey.values()].filter((d) => d.expenseCents !== 0 || d.incomeCents !== 0 || d.count !== 0);
}
