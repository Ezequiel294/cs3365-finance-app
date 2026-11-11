import { flowOf, type Transaction } from '@finance/shared';
import { Keys, UNCATEGORIZED } from '../keys';
import type { BudgetMatch } from './budget-matcher';

export interface RollupDelta {
  key: string;
  expenseCents: number;
  incomeCents: number;
  count: number;
  limitCents?: number;
}

/**
 * All rollup arithmetic lives here, so spending totals and budgets cannot drift
 * apart. `expense` adds to `expenseCents` and matching budgets, `refund`
 * subtracts from them, `income` adds to `incomeCents` only, and `excluded`
 * (transfers, card payments) touches nothing.
 */
export class RollupPlanner {
  /**
   * The deltas that take the rollups from `oldTxn` to `newTxn` (either may be null).
   * Deltas for the same key are merged (one `TransactWriteItems` cannot touch an
   * item twice) and deltas that cancel out are dropped.
   */
  plan(
    oldTxn: Transaction | null,
    newTxn: Transaction | null,
    oldBudgets: BudgetMatch[] = [],
    newBudgets: BudgetMatch[] = [],
  ): RollupDelta[] {
    const all: RollupDelta[] = [];
    if (oldTxn) all.push(...this.spendingDeltas(oldTxn, -1), ...this.budgetDeltas(oldBudgets, oldTxn, -1));
    if (newTxn) all.push(...this.spendingDeltas(newTxn, 1), ...this.budgetDeltas(newBudgets, newTxn, 1));
    return this.combine(all);
  }

  /** Merges deltas that share a key and drops the ones that cancel out. */
  combine(deltas: RollupDelta[]): RollupDelta[] {
    const merged = new Map<string, RollupDelta>();
    for (const d of deltas) {
      const existing = merged.get(d.key);
      if (!existing) {
        merged.set(d.key, { ...d });
        continue;
      }
      existing.expenseCents += d.expenseCents;
      existing.incomeCents += d.incomeCents;
      existing.count += d.count;
      if (d.limitCents !== undefined) existing.limitCents = d.limitCents;
    }
    return [...merged.values()].filter((d) => d.expenseCents !== 0 || d.incomeCents !== 0 || d.count !== 0);
  }

  private spendingDeltas(txn: Transaction, sign: 1 | -1): RollupDelta[] {
    const flow = flowOf(txn.kind);
    if (flow === 'excluded') return [];
    const usd = txn.amountUsdCents;
    const expenseCents = flow === 'expense' ? usd * sign : flow === 'refund' ? -usd * sign : 0;
    const incomeCents = flow === 'income' ? usd * sign : 0;
    const month = txn.localDate.slice(0, 7);
    const keys = [
      Keys.day(txn.localDate),
      Keys.month(month, 'TOTAL'),
      Keys.month(month, 'CAT', txn.categoryId ?? UNCATEGORIZED),
      ...[...new Set(txn.tagIds ?? [])].map((t) => Keys.month(month, 'TAG', t)),
    ];
    return keys.map((key) => ({ key, expenseCents, incomeCents, count: sign }));
  }

  private budgetDeltas(matches: BudgetMatch[], txn: Transaction, sign: 1 | -1): RollupDelta[] {
    const flow = flowOf(txn.kind);
    if (flow !== 'expense' && flow !== 'refund') return [];
    const amount = (flow === 'expense' ? txn.amountUsdCents : -txn.amountUsdCents) * sign;
    return matches.flatMap((m) => [
      { key: Keys.budgetPeriod(m.budgetId, m.periodStart), expenseCents: amount, incomeCents: 0, count: sign, limitCents: m.limitCents },
      { key: Keys.budgetDay(m.budgetId, txn.localDate), expenseCents: amount, incomeCents: 0, count: 0 },
    ]);
  }
}
