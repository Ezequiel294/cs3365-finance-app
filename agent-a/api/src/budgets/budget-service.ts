import type { BudgetChanges, NewBudget } from '../../../shared/schemas';
import type { Budget, BudgetDayTotal, BudgetPeriodTotal, WeekDay } from '../../../shared/types';
import { flowOf } from '../../../shared/kinds';
import type { Clock } from '../clock';
import { DEFAULT_TIME_ZONE } from '../categorization/settings-service';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors';
import { randomId } from '../ids';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import { isConditionalFailure } from '../repositories/dynamo-store';
import type { ReferenceRepository } from '../repositories/reference-repository';
import type { TransactionRepository } from '../repositories/transaction-repository';
import type { BudgetMatcher } from './budget-matcher';
import type { PeriodCalculator } from './period-calculator';

const HISTORY_PERIODS = 12;

/** Budgets per category and/or tags; a new or changed budget is backfilled from Transactions. */
export class BudgetService {
  constructor(
    private readonly reference: Pick<
      ReferenceRepository,
      'getCategories' | 'getTags' | 'putBudget' | 'updateBudget' | 'getBudget' | 'listBudgets' | 'getSettings'
    >,
    private readonly transactions: Pick<TransactionRepository, 'listByDate'>,
    private readonly aggregates: Pick<AggregateRepository, 'replaceBudgetItems'>,
    private readonly matcher: BudgetMatcher,
    private readonly periods: PeriodCalculator,
    private readonly clock: Clock,
  ) {}

  async create(userId: string, input: NewBudget): Promise<Budget> {
    const budget: Budget = {
      id: `b-${randomId(10)}`,
      name: input.name,
      categoryIds: [...new Set(input.categoryIds ?? [])],
      tagIds: [...new Set(input.tagIds ?? [])],
      period: input.period,
      limitCents: input.limitCents,
      startDate: input.period === 'CUSTOM' ? (input.startDate ?? null) : null,
      endDate: input.period === 'CUSTOM' ? (input.endDate ?? null) : null,
      version: 1,
    };
    await this.validateFilters(userId, budget);
    await this.reference.putBudget(userId, budget);
    await this.backfill(userId, budget);
    return budget;
  }

  async update(userId: string, budgetId: string, changes: BudgetChanges): Promise<Budget> {
    const current = await this.reference.getBudget(userId, budgetId);
    if (!current) throw new NotFoundError('Budget not found.');
    const period = changes.period ?? current.period;
    const next: Budget = {
      ...current,
      name: changes.name ?? current.name,
      categoryIds: changes.categoryIds ? [...new Set(changes.categoryIds)] : current.categoryIds,
      tagIds: changes.tagIds ? [...new Set(changes.tagIds)] : current.tagIds,
      period,
      limitCents: changes.limitCents ?? current.limitCents,
      startDate: period === 'CUSTOM' ? (changes.startDate !== undefined ? changes.startDate : current.startDate) : null,
      endDate: period === 'CUSTOM' ? (changes.endDate !== undefined ? changes.endDate : current.endDate) : null,
      version: current.version + 1,
    };
    if (next.period === 'CUSTOM' && (!next.startDate || !next.endDate || next.startDate > next.endDate)) {
      throw new ValidationError('A custom range needs a start and an end date.', { startDate: 'Choose both dates' });
    }
    await this.validateFilters(userId, next);
    try {
      await this.reference.updateBudget(userId, next, changes.version);
    } catch (e) {
      if (isConditionalFailure(e)) throw new ConflictError('This budget was changed somewhere else. Reload the budget.');
      throw e;
    }
    const rebuild =
      next.period !== current.period ||
      next.limitCents !== current.limitCents ||
      next.startDate !== current.startDate ||
      next.endDate !== current.endDate ||
      next.categoryIds.join() !== current.categoryIds.join() ||
      next.tagIds.join() !== current.tagIds.join();
    if (rebuild) await this.backfill(userId, next);
    return next;
  }

  /** Called by SettingsService when the week-start day changes. */
  async rebuildWeekly(userId: string): Promise<void> {
    const budgets = await this.reference.listBudgets(userId);
    for (const b of budgets.filter((x) => x.period === 'WEEKLY')) await this.backfill(userId, b);
  }

  /** Rebuild the budget's P# and D# items for the current period and up to 11 earlier ones. */
  async backfill(userId: string, budget: Budget): Promise<void> {
    const settings = await this.reference.getSettings(userId);
    const weekStart: WeekDay = settings?.weekStart ?? 'MONDAY';
    const today = this.clock.today(settings?.timeZone ?? DEFAULT_TIME_ZONE);
    const starts = this.periods.periods(budget, HISTORY_PERIODS, today, weekStart);
    if (!starts.length) return;
    const from = starts[0]!;
    const to = this.periods.periodEnd(starts[starts.length - 1]!, budget);
    const startSet = new Set(starts);
    const txns = await this.transactions.listByDate(userId, from, to);

    const periodTotals = new Map<string, BudgetPeriodTotal>();
    const dayTotals = new Map<string, BudgetDayTotal>();
    for (const t of txns) {
      if (!this.matcher.matches(t, budget)) continue;
      const start = this.periods.periodStart(t.localDate, budget, weekStart);
      if (!start || !startSet.has(start)) continue;
      const spent = flowOf(t.kind) === 'refund' ? -t.amountUsdCents : t.amountUsdCents;
      const p = periodTotals.get(start) ?? {
        budgetId: budget.id,
        periodStart: start,
        spentCents: 0,
        count: 0,
        limitCents: budget.limitCents,
      };
      p.spentCents += spent;
      p.count += 1;
      periodTotals.set(start, p);
      const d = dayTotals.get(t.localDate) ?? { budgetId: budget.id, date: t.localDate, spentCents: 0 };
      d.spentCents += spent;
      dayTotals.set(t.localDate, d);
    }
    await this.aggregates.replaceBudgetItems(userId, budget.id, [...periodTotals.values()], [...dayTotals.values()]);
  }

  private async validateFilters(userId: string, budget: Budget): Promise<void> {
    if (budget.categoryIds.length) {
      const found = await this.reference.getCategories(userId, budget.categoryIds);
      if (found.length !== budget.categoryIds.length) {
        throw new ValidationError('Unknown category.', { categoryIds: 'Choose categories from the list' });
      }
    }
    if (budget.tagIds.length) {
      const found = await this.reference.getTags(userId, budget.tagIds);
      if (found.length !== budget.tagIds.length) {
        throw new ValidationError('Unknown tag.', { tagIds: 'Choose tags from the list' });
      }
    }
  }
}
