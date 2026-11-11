import { countsAsSpending, type Budget, type Transaction, type WeekDay } from '@finance/shared';
import { PeriodCalculator } from './period-calculator';

export interface BudgetMatch {
  budgetId: string;
  periodStart: string;
  limitCents: number;
}

/**
 * A transaction matches a budget when it counts as spending, its category is in
 * `categoryIds` (or the list is empty), and it has any of `tagIds` (or the list is empty).
 */
export class BudgetMatcher {
  constructor(private readonly periods: PeriodCalculator = new PeriodCalculator()) {}

  matches(txn: Pick<Transaction, 'kind' | 'categoryId' | 'tagIds'>, budget: Budget): boolean {
    if (!countsAsSpending(txn.kind)) return false;
    if (budget.categoryIds.length > 0 && (!txn.categoryId || !budget.categoryIds.includes(txn.categoryId))) return false;
    if (budget.tagIds.length > 0 && !(txn.tagIds ?? []).some((t) => budget.tagIds.includes(t))) return false;
    return true;
  }

  matching(txn: Transaction, budgets: Budget[], weekStart: WeekDay = 'MONDAY'): BudgetMatch[] {
    const result: BudgetMatch[] = [];
    for (const budget of budgets) {
      if (!this.matches(txn, budget)) continue;
      const periodStart = this.periods.periodStart(txn.localDate, budget, weekStart);
      if (!periodStart) continue;
      result.push({ budgetId: budget.id, periodStart, limitCents: budget.limitCents });
    }
    return result;
  }
}
