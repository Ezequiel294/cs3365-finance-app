import type { Budget, WeekDay } from '@finance/shared';

const DAY_INDEX: Record<WeekDay, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

function addMonths(date: string, months: number): string {
  const d = parse(date);
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)));
}

type PeriodBudget = Pick<Budget, 'period' | 'startDate' | 'endDate'>;

/** Period boundaries for budgets. Dates are local `yyyy-mm-dd` strings. */
export class PeriodCalculator {
  /** Start of the period that contains `localDate`, or null when a custom budget does not cover it. */
  periodStart(localDate: string, budget: PeriodBudget, weekStart: WeekDay = 'MONDAY'): string | null {
    const d = parse(localDate);
    switch (budget.period) {
      case 'WEEKLY': {
        const diff = (d.getUTCDay() - DAY_INDEX[weekStart] + 7) % 7;
        return addDays(localDate, -diff);
      }
      case 'MONTHLY':
        return `${localDate.slice(0, 7)}-01`;
      case 'QUARTERLY': {
        const q = Math.floor(d.getUTCMonth() / 3) * 3 + 1;
        return `${localDate.slice(0, 4)}-${String(q).padStart(2, '0')}-01`;
      }
      case 'YEARLY':
        return `${localDate.slice(0, 4)}-01-01`;
      case 'CUSTOM':
        if (!budget.startDate || !budget.endDate) return null;
        return localDate >= budget.startDate && localDate <= budget.endDate ? budget.startDate : null;
    }
  }

  /** Last day of the period starting at `periodStart`. */
  periodEnd(periodStart: string, budget: PeriodBudget): string {
    switch (budget.period) {
      case 'WEEKLY':
        return addDays(periodStart, 6);
      case 'MONTHLY':
        return addDays(addMonths(periodStart, 1), -1);
      case 'QUARTERLY':
        return addDays(addMonths(periodStart, 3), -1);
      case 'YEARLY':
        return addDays(addMonths(periodStart, 12), -1);
      case 'CUSTOM':
        return budget.endDate ?? periodStart;
    }
  }

  /** The current period and up to `count - 1` earlier ones, oldest first. */
  periods(budget: PeriodBudget, count: number, today: string, weekStart: WeekDay = 'MONDAY'): string[] {
    if (budget.period === 'CUSTOM') return budget.startDate ? [budget.startDate] : [];
    const current = this.periodStart(today, budget, weekStart)!;
    const result = [current];
    let cursor = current;
    for (let i = 1; i < count; i++) {
      cursor = this.periodStart(addDays(cursor, -1), budget, weekStart)!;
      result.unshift(cursor);
    }
    return result;
  }

  /** The period that is current on `today` (for a custom budget, its only period). */
  currentPeriod(budget: PeriodBudget, today: string, weekStart: WeekDay = 'MONDAY'): string | null {
    if (budget.period === 'CUSTOM') return budget.startDate ?? null;
    return this.periodStart(today, budget, weekStart);
  }

  daysInPeriod(periodStart: string, budget: PeriodBudget): number {
    return daysBetween(periodStart, this.periodEnd(periodStart, budget)) + 1;
  }
}
