import "server-only";
import type { BudgetProgress, CategoryShare, MonthTotal, TagTotal } from "@finance/shared";
import { load } from "./result";

/** AnalyticsLoader: server-side data loading for the dashboard and cash-flow pages. */
export const AnalyticsLoader = {
  async spendingByCategory(month: string): Promise<CategoryShare[]> {
    const q = new URLSearchParams({ period: "month", month, groupBy: "category" });
    return (await load((api, token) => api.get<{ categories: CategoryShare[] }>(`/api/analytics/spending?${q}`, token))).categories;
  },

  /** Tag totals, with the limit of a budget that targets exactly that tag shown next to it (04-S03). */
  async spendingByTag(month: string, budgets: BudgetProgress[] = []): Promise<TagTotal[]> {
    const q = new URLSearchParams({ period: "month", month, groupBy: "tag" });
    const tags = (await load((api, token) => api.get<{ tags: TagTotal[] }>(`/api/analytics/spending?${q}`, token))).tags;
    return tags.map((t) => {
      const budget = budgets.find((b) => b.budget.period === "MONTHLY" && b.budget.categoryIds.length === 0 && b.budget.tagIds.includes(t.tagId));
      return budget ? { ...t, budgetLimitCents: budget.limitCents } : t;
    });
  },

  async monthlyTotals(from: string, to: string): Promise<MonthTotal[]> {
    const q = new URLSearchParams({ period: "month", from, to });
    return (await load((api, token) => api.get<{ months: MonthTotal[] }>(`/api/analytics/spending?${q}`, token))).months;
  },
};
