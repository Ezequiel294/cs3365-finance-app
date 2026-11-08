import { countsAsSpending, type Budget, type Transaction, type WeekStart } from "@finance/shared";
import { PeriodCalculator } from "./period-calculator";

export interface BudgetMatch {
  budgetId: string;
  periodStart: string;
  limitCents: number;
}

type MatchableTxn = Pick<Transaction, "kind" | "categoryId" | "tagIds" | "localDate">;

/**
 * A transaction matches a budget when it counts as spending, its category is in the budget's
 * categories (or the budget has none), and it has any of the budget's tags (or the budget has none).
 */
export class BudgetMatcher {
  constructor(private readonly periods: PeriodCalculator = new PeriodCalculator()) {}

  matches(txn: MatchableTxn, budget: Budget): boolean {
    if (!countsAsSpending(txn.kind)) return false;
    if (budget.categoryIds.length > 0 && (!txn.categoryId || !budget.categoryIds.includes(txn.categoryId))) return false;
    if (budget.tagIds.length > 0 && !budget.tagIds.some((t) => txn.tagIds.includes(t))) return false;
    return true;
  }

  matching(txn: MatchableTxn, budgets: Budget[], weekStart: WeekStart = "MONDAY"): BudgetMatch[] {
    const out: BudgetMatch[] = [];
    for (const budget of budgets) {
      if (!this.matches(txn, budget)) continue;
      const periodStart = this.periods.periodStart(txn.localDate, budget, weekStart);
      if (!periodStart) continue;
      out.push({ budgetId: budget.id, periodStart, limitCents: budget.limitCents });
    }
    return out;
  }
}
