import { WEEK_DAYS, type Budget, type WeekStart } from "@finance/shared";
import { addDays, addMonths, daysBetween, toUtc } from "../dates";

type PeriodBudget = Pick<Budget, "period" | "startDate" | "endDate">;

/** Period boundaries for weekly, monthly, quarterly, yearly, and custom budgets. */
export class PeriodCalculator {
  /** The first day of the period containing `localDate`, or null when a custom budget does not cover it. */
  periodStart(localDate: string, budget: PeriodBudget, weekStart: WeekStart = "MONDAY"): string | null {
    switch (budget.period) {
      case "WEEKLY": {
        // getUTCDay: 0 = Sunday. WEEK_DAYS starts on Monday.
        const dow = (toUtc(localDate).getUTCDay() + 6) % 7;
        const start = WEEK_DAYS.indexOf(weekStart);
        return addDays(localDate, -((dow - start + 7) % 7));
      }
      case "MONTHLY":
        return `${localDate.slice(0, 7)}-01`;
      case "QUARTERLY": {
        const month = Number(localDate.slice(5, 7));
        const q = Math.floor((month - 1) / 3) * 3 + 1;
        return `${localDate.slice(0, 4)}-${String(q).padStart(2, "0")}-01`;
      }
      case "YEARLY":
        return `${localDate.slice(0, 4)}-01-01`;
      case "CUSTOM":
        if (!budget.startDate || !budget.endDate) return null;
        return localDate >= budget.startDate && localDate <= budget.endDate ? budget.startDate : null;
    }
  }

  /** The last day of the period that starts on `periodStart`. */
  periodEnd(periodStart: string, budget: PeriodBudget): string {
    switch (budget.period) {
      case "WEEKLY":
        return addDays(periodStart, 6);
      case "MONTHLY":
        return addDays(addMonths(periodStart, 1), -1);
      case "QUARTERLY":
        return addDays(addMonths(periodStart, 3), -1);
      case "YEARLY":
        return addDays(addMonths(periodStart, 12), -1);
      case "CUSTOM":
        return budget.endDate ?? periodStart;
    }
  }

  /** The period containing `today` and up to `count - 1` earlier ones, oldest first. */
  periods(budget: PeriodBudget, count: number, today: string, weekStart: WeekStart = "MONDAY"): string[] {
    if (budget.period === "CUSTOM") return budget.startDate ? [budget.startDate] : [];
    const current = this.periodStart(today, budget, weekStart);
    if (!current) return [];
    const out = [current];
    let cur = current;
    for (let i = 1; i < count; i++) {
      cur = this.periodStart(addDays(cur, -1), budget, weekStart)!;
      out.unshift(cur);
    }
    return out;
  }

  daysInPeriod(periodStart: string, budget: PeriodBudget): number {
    return daysBetween(periodStart, this.periodEnd(periodStart, budget)) + 1;
  }
}
