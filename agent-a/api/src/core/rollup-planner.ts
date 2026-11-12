import { UNCATEGORIZED_ID } from '../../../shared/catalog';
import { monthOf } from '../../../shared/dates';
import { countsAsSpending, flowOf } from '../../../shared/kinds';
import type { Transaction } from '../../../shared/types';
import { Keys } from '../keys';

export interface RollupDelta {
  key: string;
  /** For budget items this is the change in spentCents. */
  expenseCents: number;
  incomeCents: number;
  count: number;
  limitCents?: number;
}

export interface BudgetMatch {
  budgetId: string;
  periodStart: string;
  limitCents: number;
}

type RollupTxn = Pick<
  Transaction,
  'kind' | 'amountUsdCents' | 'localDate' | 'categoryId' | 'tagIds'
>;

/**
 * All rollup arithmetic lives here, so spending totals and budgets cannot drift apart.
 * `plan` subtracts the old transaction's contribution and adds the new one's, then merges
 * the deltas by key (one TransactWriteItems cannot touch the same item twice).
 */
export class RollupPlanner {
  plan(
    oldTxn: RollupTxn | null,
    newTxn: RollupTxn | null,
    oldBudgets: BudgetMatch[] = [],
    newBudgets: BudgetMatch[] = [],
  ): RollupDelta[] {
    const deltas: RollupDelta[] = [];
    if (oldTxn) {
      deltas.push(...this.spendingDeltas(oldTxn, -1), ...this.budgetDeltas(oldBudgets, oldTxn, -1));
    }
    if (newTxn) {
      deltas.push(...this.spendingDeltas(newTxn, 1), ...this.budgetDeltas(newBudgets, newTxn, 1));
    }
    return mergeDeltas(deltas);
  }

  private spendingDeltas(txn: RollupTxn, sign: 1 | -1): RollupDelta[] {
    const flow = flowOf(txn.kind);
    if (flow === 'excluded') return [];
    const usd = txn.amountUsdCents;
    const expense = flow === 'expense' ? usd : flow === 'refund' ? -usd : 0;
    const income = flow === 'income' ? usd : 0;
    const month = monthOf(txn.localDate);
    const keys = [
      Keys.day(txn.localDate),
      Keys.month(month, 'TOTAL'),
      Keys.month(month, 'CAT', txn.categoryId ?? UNCATEGORIZED_ID),
      ...[...new Set(txn.tagIds ?? [])].map((t) => Keys.month(month, 'TAG', t)),
    ];
    return keys.map((key) => ({
      key,
      expenseCents: sign * expense,
      incomeCents: sign * income,
      count: sign,
    }));
  }

  private budgetDeltas(matches: BudgetMatch[], txn: RollupTxn, sign: 1 | -1): RollupDelta[] {
    if (!countsAsSpending(txn)) return [];
    const flow = flowOf(txn.kind);
    const spent = flow === 'refund' ? -txn.amountUsdCents : txn.amountUsdCents;
    const out: RollupDelta[] = [];
    for (const m of matches) {
      out.push({
        key: Keys.budgetPeriod(m.budgetId, m.periodStart),
        expenseCents: sign * spent,
        incomeCents: 0,
        count: sign,
        limitCents: m.limitCents,
      });
      out.push({
        key: Keys.budgetDay(m.budgetId, txn.localDate),
        expenseCents: sign * spent,
        incomeCents: 0,
        count: 0,
      });
    }
    return out;
  }
}

/** Sum deltas that touch the same item and drop the ones that cancel out. */
export function mergeDeltas(deltas: RollupDelta[]): RollupDelta[] {
  const byKey = new Map<string, RollupDelta>();
  for (const d of deltas) {
    const cur = byKey.get(d.key);
    if (!cur) {
      byKey.set(d.key, { ...d });
    } else {
      cur.expenseCents += d.expenseCents;
      cur.incomeCents += d.incomeCents;
      cur.count += d.count;
      if (d.limitCents !== undefined && d.count > 0) cur.limitCents = d.limitCents;
    }
  }
  return [...byKey.values()].filter(
    (d) => d.expenseCents !== 0 || d.incomeCents !== 0 || d.count !== 0,
  );
}
