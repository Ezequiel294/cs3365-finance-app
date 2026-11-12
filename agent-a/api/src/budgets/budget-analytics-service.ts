import type { BudgetProgress, BurndownSeries } from '../../../shared/api-types';
import { dateRange, diffDays } from '../../../shared/dates';
import { mulDivRoundHalfEven } from '../../../shared/money';
import type { Budget, WeekDay } from '../../../shared/types';
import type { Clock } from '../clock';
import { DEFAULT_TIME_ZONE } from '../categorization/settings-service';
import { NotFoundError } from '../http/errors';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import type { ReferenceRepository } from '../repositories/reference-repository';
import type { PeriodCalculator } from './period-calculator';

/** Budget progress (03-S11) and burn-down, read from the stored P# and D# items. */
export class BudgetAnalyticsService {
  constructor(
    private readonly reference: Pick<ReferenceRepository, 'listBudgets' | 'getBudget' | 'getSettings'>,
    private readonly aggregates: Pick<AggregateRepository, 'getBudgetPeriods' | 'getBudgetDays'>,
    private readonly periods: PeriodCalculator,
    private readonly clock: Clock,
  ) {}

  private async context(userId: string, today?: string): Promise<{ today: string; weekStart: WeekDay }> {
    const s = await this.reference.getSettings(userId);
    return {
      today: today ?? this.clock.today(s?.timeZone ?? DEFAULT_TIME_ZONE),
      weekStart: s?.weekStart ?? 'MONDAY',
    };
  }

  /** The period shown for today; a custom range that has not started or has ended shows its own dates. */
  private currentStart(budget: Budget, today: string, weekStart: WeekDay): string {
    if (budget.period === 'CUSTOM') return budget.startDate ?? today;
    return this.periods.periodStart(today, budget, weekStart)!;
  }

  async progress(userId: string, todayArg?: string): Promise<BudgetProgress[]> {
    const [budgets, ctx] = await Promise.all([this.reference.listBudgets(userId), this.context(userId, todayArg)]);
    if (!budgets.length) return [];
    const starts = budgets.map((b) => ({ budgetId: b.id, periodStart: this.currentStart(b, ctx.today, ctx.weekStart) }));
    const totals = await this.aggregates.getBudgetPeriods(userId, starts);
    const byId = new Map(totals.map((t) => [`${t.budgetId}|${t.periodStart}`, t]));
    const out = budgets.map((budget, i) => {
      const periodStart = starts[i]!.periodStart;
      const periodEnd = this.periods.periodEnd(periodStart, budget);
      const days = this.periods.daysInPeriod(periodStart, budget);
      const spentCents = byId.get(`${budget.id}|${periodStart}`)?.spentCents ?? 0;
      const limitCents = budget.limitCents;
      const elapsed = Math.min(days, Math.max(0, diffDays(periodStart, ctx.today) + 1));
      return {
        budget,
        periodStart,
        periodEnd,
        daysLeft: Math.max(0, diffDays(ctx.today, periodEnd)),
        spentCents,
        limitCents,
        remainingCents: limitCents - spentCents,
        percent: limitCents > 0 ? mulDivRoundHalfEven(Math.max(spentCents, 0), 100, limitCents) : 0,
        overByCents: Math.max(0, spentCents - limitCents),
        expectedCents: mulDivRoundHalfEven(limitCents, elapsed, days),
      } satisfies BudgetProgress;
    });
    return out.sort((a, b) => b.percent - a.percent || a.budget.name.localeCompare(b.budget.name));
  }

  async burndown(userId: string, budgetId: string, todayArg?: string): Promise<BurndownSeries> {
    const [budget, ctx] = await Promise.all([this.reference.getBudget(userId, budgetId), this.context(userId, todayArg)]);
    if (!budget) throw new NotFoundError('Budget not found.');
    const start = this.currentStart(budget, ctx.today, ctx.weekStart);
    const end = this.periods.periodEnd(start, budget);
    const dates = dateRange(start, end);
    const lastDay = ctx.today < end ? ctx.today : end;
    const days = ctx.today >= start ? await this.aggregates.getBudgetDays(userId, budgetId, start, lastDay) : [];
    const perDay = new Map(days.map((d) => [d.date, d.spentCents]));
    const cumulativeSpentCents: number[] = [];
    let running = 0;
    for (const d of dates) {
      if (d > lastDay || ctx.today < start) break;
      running += perDay.get(d) ?? 0;
      cumulativeSpentCents.push(running);
    }
    const n = dates.length;
    const paceCents = dates.map((_, i) => mulDivRoundHalfEven(budget.limitCents, i + 1, n));
    return { dates, cumulativeSpentCents, paceCents, limitCents: budget.limitCents };
  }
}
