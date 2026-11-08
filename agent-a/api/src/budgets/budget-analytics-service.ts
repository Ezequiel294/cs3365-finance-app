import type { Budget, BudgetProgress, BurndownSeries } from "@finance/shared";
import type { Clock } from "../clock";
import { dateRange } from "../dates";
import { NotFoundError } from "../http/errors";
import type { AggregateRepository } from "../repositories/aggregate-repository";
import type { ReferenceRepository } from "../repositories/reference-repository";
import type { PeriodCalculator } from "./period-calculator";

export class BudgetAnalyticsService {
  constructor(
    private readonly reference: ReferenceRepository,
    private readonly aggregates: AggregateRepository,
    private readonly periods: PeriodCalculator,
    private readonly clock: Clock,
  ) {}

  /** Each budget's current period: spent, limit, remaining, percent (no upper bound), and amount over. */
  async progress(userId: string, today?: string): Promise<BudgetProgress[]> {
    const [budgets, settings] = await Promise.all([this.reference.listBudgets(userId), this.reference.getSettings(userId)]);
    const day = today ?? this.clock.today(settings.timeZone);
    const current = budgets.map((b) => ({ budget: b, periodStart: this.currentStart(b, day, settings.weekStart) }));
    const totals = await this.aggregates.getBudgetPeriods(
      userId,
      current.map((c) => ({ budgetId: c.budget.id, periodStart: c.periodStart })),
    );
    const byKey = new Map(totals.map((t) => [`${t.budgetId}|${t.periodStart}`, t]));
    return current
      .map(({ budget, periodStart }) => {
        const spentCents = byKey.get(`${budget.id}|${periodStart}`)?.spentCents ?? 0;
        return {
          budget,
          periodStart,
          periodEnd: this.periods.periodEnd(periodStart, budget),
          ...BudgetAnalyticsService.proportion(spentCents, budget.limitCents),
        };
      })
      .sort((a, b) => a.budget.name.localeCompare(b.budget.name));
  }

  /** `percent = round(spent / limit × 100)`, `remaining = limit − spent`, `overBy = max(0, spent − limit)`. */
  static proportion(spentCents: number, limitCents: number) {
    return {
      spentCents,
      limitCents,
      remainingCents: limitCents - spentCents,
      percent: limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : 0,
      overByCents: Math.max(0, spentCents - limitCents),
    };
  }

  /** Cumulative spending per day of the current period, with the even-pace line `limit × day ÷ daysInPeriod`. */
  async burndown(userId: string, budgetId: string, today?: string): Promise<BurndownSeries> {
    const [budget, settings] = await Promise.all([this.reference.getBudget(userId, budgetId), this.reference.getSettings(userId)]);
    if (!budget) throw new NotFoundError("budget not found");
    const day = today ?? this.clock.today(settings.timeZone);
    const periodStart = this.currentStart(budget, day, settings.weekStart);
    const periodEnd = this.periods.periodEnd(periodStart, budget);
    const last = day < periodEnd ? (day < periodStart ? periodStart : day) : periodEnd;
    const days = await this.aggregates.getBudgetDays(userId, budgetId, periodStart, last);
    const spentByDay = new Map(days.map((d) => [d.date, d.spentCents]));
    const total = this.periods.daysInPeriod(periodStart, budget);
    const dates = dateRange(periodStart, last);
    let running = 0;
    const cumulativeSpentCents: number[] = [];
    const paceCents: number[] = [];
    dates.forEach((d, i) => {
      running += spentByDay.get(d) ?? 0;
      cumulativeSpentCents.push(running);
      paceCents.push(Math.round((budget.limitCents * (i + 1)) / total));
    });
    return { budgetId, periodStart, periodEnd, limitCents: budget.limitCents, dates, cumulativeSpentCents, paceCents };
  }

  private currentStart(budget: Budget, today: string, weekStart: Parameters<PeriodCalculator["periodStart"]>[2]): string {
    if (budget.period === "CUSTOM") return budget.startDate ?? today;
    return this.periods.periodStart(today, budget, weekStart) ?? today;
  }
}
