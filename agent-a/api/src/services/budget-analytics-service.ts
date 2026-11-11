import type { BudgetProgress, BurndownSeries } from '@finance/shared';
import type { Clock } from '../clock';
import { NotFoundError } from '../errors';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import type { ReferenceRepository } from '../repositories/reference-repository';
import { addDays, type PeriodCalculator } from './period-calculator';

export class BudgetAnalyticsService {
  constructor(
    private readonly reference: ReferenceRepository,
    private readonly aggregates: AggregateRepository,
    private readonly periods: PeriodCalculator,
    private readonly clock: Clock,
  ) {}

  /** Each budget's current period: spent, limit, remaining, percent (no upper bound), and amount over. */
  async progress(userId: string, today?: string): Promise<BudgetProgress[]> {
    const settings = await this.reference.getSettings(userId);
    const day = today ?? this.clock.today(settings.timeZone);
    const budgets = await this.reference.listBudgets(userId);
    const current = budgets.flatMap((b) => {
      const start = this.periods.currentPeriod(b, day, settings.weekStart);
      return start ? [{ budget: b, start }] : [];
    });
    const totals = await this.aggregates.getBudgetPeriods(
      userId,
      current.map((c) => ({ budgetId: c.budget.id, periodStart: c.start })),
    );
    const byKey = new Map(totals.map((t) => [`${t.budgetId}|${t.periodStart}`, t]));
    return current
      .map(({ budget, start }) => {
        const spentCents = byKey.get(`${budget.id}|${start}`)?.spentCents ?? 0;
        const limitCents = budget.limitCents;
        return {
          budget,
          periodStart: start,
          periodEnd: this.periods.periodEnd(start, budget),
          spentCents,
          limitCents,
          remainingCents: limitCents - spentCents,
          percent: limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : 0,
          overByCents: Math.max(0, spentCents - limitCents),
        };
      })
      .sort((a, b) => a.budget.name.localeCompare(b.budget.name));
  }

  /** Cumulative spending per day of the current period and the even-pace line `limit × day ÷ days`. */
  async burndown(userId: string, budgetId: string, today?: string): Promise<BurndownSeries> {
    const settings = await this.reference.getSettings(userId);
    const day = today ?? this.clock.today(settings.timeZone);
    const budget = await this.reference.getBudget(userId, budgetId);
    if (!budget) throw new NotFoundError('Budget not found');
    const start = this.periods.currentPeriod(budget, day, settings.weekStart) ?? day;
    const end = this.periods.periodEnd(start, budget);
    const last = day < end ? day : end;
    const daysInPeriod = this.periods.daysInPeriod(start, budget);
    const series: BurndownSeries = {
      budgetId,
      periodStart: start,
      periodEnd: end,
      limitCents: budget.limitCents,
      dates: [],
      cumulativeSpentCents: [],
      paceCents: [],
    };
    if (last < start) return series;
    const dayTotals = await this.aggregates.getBudgetDays(userId, budgetId, start, last);
    const byDate = new Map(dayTotals.map((d) => [d.date, d.spentCents]));
    let cumulative = 0;
    for (let i = 1, date = start; date <= last; i++, date = addDays(date, 1)) {
      cumulative += byDate.get(date) ?? 0;
      series.dates.push(date);
      series.cumulativeSpentCents.push(cumulative);
      series.paceCents.push(Math.round((budget.limitCents * i) / daysInPeriod));
    }
    return series;
  }
}
