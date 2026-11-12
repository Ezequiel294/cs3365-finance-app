import { countsAsSpending } from '../../../shared/kinds';
import type { Budget, Transaction, WeekDay } from '../../../shared/types';
import type { BudgetMatch } from '../core/rollup-planner';
import { PeriodCalculator } from './period-calculator';

type MatchTxn = Pick<Transaction, 'kind' | 'categoryId' | 'tagIds' | 'localDate'>;

/**
 * A transaction matches a budget when it counts as spending, its category is one of the
 * budget's categories (or the budget has none), and it has any of the budget's tags (or
 * the budget has none).
 */
export class BudgetMatcher {
  constructor(private readonly periods = new PeriodCalculator()) {}

  matches(txn: MatchTxn, budget: Pick<Budget, 'categoryIds' | 'tagIds'>): boolean {
    if (!countsAsSpending(txn)) return false;
    const cats = budget.categoryIds ?? [];
    const tags = budget.tagIds ?? [];
    if (cats.length && (!txn.categoryId || !cats.includes(txn.categoryId))) return false;
    if (tags.length && !(txn.tagIds ?? []).some((t) => tags.includes(t))) return false;
    return true;
  }

  matching(txn: MatchTxn, budgets: Budget[], weekStart: WeekDay = 'MONDAY'): BudgetMatch[] {
    const out: BudgetMatch[] = [];
    for (const b of budgets) {
      if (!this.matches(txn, b)) continue;
      const periodStart = this.periods.periodStart(txn.localDate, b, weekStart);
      if (!periodStart) continue;
      out.push({ budgetId: b.id, periodStart, limitCents: b.limitCents });
    }
    return out;
  }
}
