import type { Budget, BudgetChangesInput, BudgetDayTotal, BudgetPeriodTotal, NewBudgetInput } from '@finance/shared';
import type { Clock } from '../clock';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import { ConditionFailedError } from '../repositories/dynamo-store';
import type { ReferenceRepository } from '../repositories/reference-repository';
import type { TransactionRepository } from '../repositories/transaction-repository';
import type { BudgetMatcher } from './budget-matcher';
import type { PeriodCalculator } from './period-calculator';

/** Number of periods a budget is backfilled with: the current one and up to 11 earlier ones. */
export const BACKFILL_PERIODS = 12;

export class BudgetService {
  constructor(
    private readonly reference: ReferenceRepository,
    private readonly transactions: TransactionRepository,
    private readonly aggregates: AggregateRepository,
    private readonly matcher: BudgetMatcher,
    private readonly periods: PeriodCalculator,
    private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<Budget[]> {
    return (await this.reference.listBudgets(userId)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(userId: string, input: NewBudgetInput): Promise<Budget> {
    await this.validateIds(userId, input.categoryIds, input.tagIds);
    const budget: Budget = {
      id: crypto.randomUUID(),
      name: input.name,
      categoryIds: [...new Set(input.categoryIds)],
      tagIds: [...new Set(input.tagIds)],
      period: input.period,
      limitCents: input.limitCents,
      startDate: input.period === 'CUSTOM' ? input.startDate ?? null : null,
      endDate: input.period === 'CUSTOM' ? input.endDate ?? null : null,
      version: 1,
    };
    await this.reference.putBudget(userId, budget);
    await this.backfill(userId, budget);
    return budget;
  }

  /** Changing the period or the filters rebuilds the budget's rollups (03-S10). */
  async update(userId: string, budgetId: string, changes: BudgetChangesInput): Promise<Budget> {
    const current = await this.reference.getBudget(userId, budgetId);
    if (!current) throw new NotFoundError('Budget not found');
    if (changes.categoryIds || changes.tagIds) {
      await this.validateIds(userId, changes.categoryIds ?? [], changes.tagIds ?? []);
    }
    const period = changes.period ?? current.period;
    const next: Budget = {
      ...current,
      name: changes.name ?? current.name,
      categoryIds: changes.categoryIds ? [...new Set(changes.categoryIds)] : current.categoryIds,
      tagIds: changes.tagIds ? [...new Set(changes.tagIds)] : current.tagIds,
      period,
      limitCents: changes.limitCents ?? current.limitCents,
      startDate: period === 'CUSTOM' ? (changes.startDate !== undefined ? changes.startDate : current.startDate) ?? null : null,
      endDate: period === 'CUSTOM' ? (changes.endDate !== undefined ? changes.endDate : current.endDate) ?? null : null,
      version: current.version + 1,
    };
    if (next.period === 'CUSTOM' && (!next.startDate || !next.endDate || next.startDate > next.endDate)) {
      throw new ValidationError('A custom budget needs a start date on or before its end date');
    }
    try {
      await this.reference.updateBudget(userId, next, changes.version);
    } catch (err) {
      if (err instanceof ConditionFailedError) throw new ConflictError('The budget changed meanwhile; reload it');
      throw err;
    }
    const rebuild =
      next.period !== current.period ||
      next.startDate !== current.startDate ||
      next.endDate !== current.endDate ||
      !sameSet(next.categoryIds, current.categoryIds) ||
      !sameSet(next.tagIds, current.tagIds);
    if (rebuild) {
      await this.backfill(userId, next);
    } else if (next.limitCents !== current.limitCents) {
      const settings = await this.reference.getSettings(userId);
      const start = this.periods.currentPeriod(next, this.clock.today(settings.timeZone), settings.weekStart);
      if (start) await this.aggregates.setBudgetLimit(userId, next.id, start, next.limitCents);
    }
    return next;
  }

  /** Rebuilds the P# and D# items of the last 12 periods from `Transactions`. */
  private async backfill(userId: string, budget: Budget): Promise<void> {
    const settings = await this.reference.getSettings(userId);
    const today = this.clock.today(settings.timeZone);
    const starts = this.periods.periods(budget, BACKFILL_PERIODS, today, settings.weekStart);
    if (starts.length === 0) return;
    const from = starts[0];
    const to = this.periods.periodEnd(starts[starts.length - 1], budget);
    const txns = await this.transactions.listByDate(userId, from, to);

    const periodTotals = new Map<string, BudgetPeriodTotal>(
      starts.map((s) => [s, { budgetId: budget.id, periodStart: s, spentCents: 0, count: 0, limitCents: budget.limitCents }]),
    );
    const dayTotals = new Map<string, BudgetDayTotal>();
    for (const match of txns.flatMap((t) => this.matcher.matching(t, [budget], settings.weekStart).map((m) => ({ t, m })))) {
      const total = periodTotals.get(match.m.periodStart);
      if (!total) continue;
      const signed = match.t.kind === 'refund' ? -match.t.amountUsdCents : match.t.amountUsdCents;
      total.spentCents += signed;
      total.count += 1;
      const day = dayTotals.get(match.t.localDate) ?? { budgetId: budget.id, date: match.t.localDate, spentCents: 0 };
      day.spentCents += signed;
      dayTotals.set(match.t.localDate, day);
    }
    await this.aggregates.replaceBudgetItems(userId, budget.id, [...periodTotals.values()], [...dayTotals.values()]);
  }

  private async validateIds(userId: string, categoryIds: string[], tagIds: string[]): Promise<void> {
    const cats = new Set((await this.reference.getCategories(userId, [...new Set(categoryIds)])).filter((c) => !c.archived).map((c) => c.id));
    if (categoryIds.some((c) => !cats.has(c))) throw new ValidationError('Invalid category');
    const tags = new Set((await this.reference.getTags(userId, [...new Set(tagIds)])).filter((t) => !t.archived).map((t) => t.id));
    if (tagIds.some((t) => !tags.has(t))) throw new ValidationError('Invalid tag');
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
