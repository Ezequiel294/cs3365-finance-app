import { expenseSign, type Budget, type BudgetChanges, type BudgetDayTotal, type BudgetPeriodTotal, type NewBudget } from "@finance/shared";
import { LabelValidator } from "../categorization/label-validator";
import type { Clock } from "../clock";
import { NotFoundError, ValidationError } from "../http/errors";
import { randomId } from "../ids";
import type { AggregateRepository } from "../repositories/aggregate-repository";
import type { ReferenceRepository } from "../repositories/reference-repository";
import type { TransactionRepository } from "../repositories/transaction-repository";
import type { BudgetMatcher } from "./budget-matcher";
import type { PeriodCalculator } from "./period-calculator";

/** How many periods (the current one and earlier) a new or changed budget is backfilled with. */
export const BACKFILL_PERIODS = 12;

export class BudgetService {
  private readonly labels: LabelValidator;

  constructor(
    private readonly reference: ReferenceRepository,
    private readonly transactions: TransactionRepository,
    private readonly aggregates: AggregateRepository,
    private readonly matcher: BudgetMatcher,
    private readonly periods: PeriodCalculator,
    private readonly clock: Clock,
  ) {
    this.labels = new LabelValidator(reference);
  }

  async create(userId: string, input: NewBudget): Promise<Budget> {
    await this.validateFilters(userId, input.categoryIds, input.tagIds);
    const budget: Budget = {
      id: randomId(12),
      name: input.name,
      categoryIds: [...new Set(input.categoryIds)],
      tagIds: [...new Set(input.tagIds)],
      period: input.period,
      limitCents: input.limitCents,
      startDate: input.period === "CUSTOM" ? input.startDate : undefined,
      endDate: input.period === "CUSTOM" ? input.endDate : undefined,
      version: 1,
    };
    await this.reference.putBudget(userId, budget);
    await this.backfill(userId, budget);
    return budget;
  }

  async update(userId: string, budgetId: string, changes: BudgetChanges): Promise<Budget> {
    const current = await this.reference.getBudget(userId, budgetId);
    if (!current) throw new NotFoundError("budget not found");
    const next: Budget = {
      ...current,
      name: changes.name ?? current.name,
      categoryIds: changes.categoryIds ? [...new Set(changes.categoryIds)] : current.categoryIds,
      tagIds: changes.tagIds ? [...new Set(changes.tagIds)] : current.tagIds,
      period: changes.period ?? current.period,
      limitCents: changes.limitCents ?? current.limitCents,
      startDate: changes.startDate ?? current.startDate,
      endDate: changes.endDate ?? current.endDate,
      version: changes.version + 1,
    };
    if (next.period !== "CUSTOM") {
      next.startDate = undefined;
      next.endDate = undefined;
    } else if (!next.startDate || !next.endDate || next.startDate > next.endDate) {
      throw new ValidationError("a custom budget needs startDate and endDate, with startDate first");
    }
    if (next.categoryIds.length + next.tagIds.length === 0) throw new ValidationError("a budget needs at least one category or tag");
    if (changes.categoryIds || changes.tagIds) await this.validateFilters(userId, next.categoryIds, next.tagIds);

    await this.reference.updateBudget(userId, next, changes.version);
    const rebuild =
      next.period !== current.period ||
      next.limitCents !== current.limitCents ||
      next.startDate !== current.startDate ||
      next.endDate !== current.endDate ||
      !sameSet(next.categoryIds, current.categoryIds) ||
      !sameSet(next.tagIds, current.tagIds);
    if (rebuild) await this.backfill(userId, next);
    return next;
  }

  /**
   * Rebuilds the budget's `P#` and `D#` items for the current period and up to 11 earlier ones from
   * the transactions in that range.
   */
  private async backfill(userId: string, budget: Budget): Promise<void> {
    const settings = await this.reference.getSettings(userId);
    const today = this.clock.today(settings.timeZone);
    const starts = this.periods.periods(budget, BACKFILL_PERIODS, today, settings.weekStart);
    if (starts.length === 0) {
      await this.aggregates.replaceBudgetItems(userId, budget.id, [], []);
      return;
    }
    const from = starts[0];
    const to = this.periods.periodEnd(starts[starts.length - 1], budget);
    const txns = await this.transactions.listByDate(userId, from, to);

    const periodTotals = new Map<string, BudgetPeriodTotal>(
      starts.map((p) => [p, { budgetId: budget.id, periodStart: p, spentCents: 0, count: 0, limitCents: budget.limitCents }]),
    );
    const dayTotals = new Map<string, BudgetDayTotal>();
    for (const t of txns) {
      if (!this.matcher.matches(t, budget)) continue;
      const start = this.periods.periodStart(t.localDate, budget, settings.weekStart);
      const period = start ? periodTotals.get(start) : undefined;
      if (!period) continue;
      const spent = expenseSign(t.kind) * t.amountUsdCents;
      period.spentCents += spent;
      period.count += 1;
      const day = dayTotals.get(t.localDate) ?? { budgetId: budget.id, date: t.localDate, spentCents: 0 };
      day.spentCents += spent;
      dayTotals.set(t.localDate, day);
    }
    await this.aggregates.replaceBudgetItems(
      userId,
      budget.id,
      [...periodTotals.values()],
      [...dayTotals.values()].filter((d) => d.spentCents !== 0),
    );
  }

  private async validateFilters(userId: string, categoryIds: string[], tagIds: string[]): Promise<void> {
    if (categoryIds.length) await this.labels.validateCategories(userId, categoryIds);
    if (tagIds.length) await this.labels.validateTags(userId, tagIds);
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
