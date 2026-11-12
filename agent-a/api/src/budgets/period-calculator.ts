import { addDays, addMonths, dayOfWeek, diffDays, lastDayOfMonth, monthOf } from '../../../shared/dates';
import type { Budget, WeekDay } from '../../../shared/types';

const WEEKDAY_INDEX: Record<WeekDay, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

type PeriodBudget = Pick<Budget, 'period' | 'startDate' | 'endDate'>;

/** Period boundaries for every budget period type. */
export class PeriodCalculator {
  /** The start of the period containing `localDate`, or null when a custom range excludes it. */
  periodStart(localDate: string, budget: PeriodBudget, weekStart: WeekDay = 'MONDAY'): string | null {
    switch (budget.period) {
      case 'WEEKLY': {
        const diff = (dayOfWeek(localDate) - WEEKDAY_INDEX[weekStart] + 7) % 7;
        return addDays(localDate, -diff);
      }
      case 'MONTHLY':
        return `${monthOf(localDate)}-01`;
      case 'QUARTERLY': {
        const [y, m] = localDate.split('-').map(Number) as [number, number];
        const qm = Math.floor((m - 1) / 3) * 3 + 1;
        return `${y}-${String(qm).padStart(2, '0')}-01`;
      }
      case 'YEARLY':
        return `${localDate.slice(0, 4)}-01-01`;
      case 'CUSTOM':
        if (!budget.startDate || !budget.endDate) return null;
        return localDate >= budget.startDate && localDate <= budget.endDate ? budget.startDate : null;
    }
  }

  /** Last day (inclusive) of the period that starts on `periodStart`. */
  periodEnd(periodStart: string, budget: PeriodBudget): string {
    switch (budget.period) {
      case 'WEEKLY':
        return addDays(periodStart, 6);
      case 'MONTHLY':
        return lastDayOfMonth(monthOf(periodStart));
      case 'QUARTERLY':
        return lastDayOfMonth(addMonths(monthOf(periodStart), 2));
      case 'YEARLY':
        return `${periodStart.slice(0, 4)}-12-31`;
      case 'CUSTOM':
        return budget.endDate ?? periodStart;
    }
  }

  daysInPeriod(periodStart: string, budget: PeriodBudget): number {
    return diffDays(periodStart, this.periodEnd(periodStart, budget)) + 1;
  }

  /** The starts of the last `count` periods, oldest first, ending with the one holding `today`. */
  periods(budget: PeriodBudget, count: number, today: string, weekStart: WeekDay = 'MONDAY'): string[] {
    if (budget.period === 'CUSTOM') return budget.startDate ? [budget.startDate] : [];
    const current = this.periodStart(today, budget, weekStart)!;
    const out: string[] = [];
    let start = current;
    for (let i = 0; i < count; i++) {
      out.unshift(start);
      start = this.previousStart(start, budget);
    }
    return out;
  }

  private previousStart(start: string, budget: PeriodBudget): string {
    switch (budget.period) {
      case 'WEEKLY':
        return addDays(start, -7);
      case 'MONTHLY':
        return `${addMonths(monthOf(start), -1)}-01`;
      case 'QUARTERLY':
        return `${addMonths(monthOf(start), -3)}-01`;
      case 'YEARLY':
        return `${Number(start.slice(0, 4)) - 1}-01-01`;
      case 'CUSTOM':
        return start;
    }
  }
}
