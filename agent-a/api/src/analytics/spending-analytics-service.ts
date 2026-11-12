import type { CategoryShare, MonthTotal, TagTotal } from '../../../shared/api-types';
import { UNCATEGORIZED_ID, UNCATEGORIZED_NAME } from '../../../shared/catalog';
import { monthRange } from '../../../shared/dates';
import { mulDivRoundHalfEven } from '../../../shared/money';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import type { ReferenceRepository } from '../repositories/reference-repository';

/** Read-only spending views from the MONTH# rollups (04-S01, 04-S03, 04-S06). */
export class SpendingAnalyticsService {
  constructor(
    private readonly aggregates: Pick<AggregateRepository, 'getMonth' | 'getMonths'>,
    private readonly reference: Pick<ReferenceRepository, 'listCategories' | 'listTags' | 'listBudgets'>,
  ) {}

  async byCategory(userId: string, month: string): Promise<CategoryShare[]> {
    const [rows, categories] = await Promise.all([
      this.aggregates.getMonth(userId, month, 'CAT'),
      this.reference.listCategories(userId),
    ]);
    const names = new Map(categories.map((c) => [c.id, c.name]));
    const spending = rows.filter((r) => r.expenseCents > 0);
    const total = spending.reduce((s, r) => s + r.expenseCents, 0);
    return spending
      .map((r) => ({
        categoryId: r.dimensionId,
        name:
          r.dimensionId === UNCATEGORIZED_ID
            ? UNCATEGORIZED_NAME
            : (names.get(r.dimensionId) ?? 'Removed category'),
        expenseCents: r.expenseCents,
        share: total > 0 ? mulDivRoundHalfEven(r.expenseCents, 10000, total) : 0,
      }))
      .sort((a, b) => b.expenseCents - a.expenseCents);
  }

  async byTag(userId: string, month: string): Promise<TagTotal[]> {
    const [rows, tags, budgets] = await Promise.all([
      this.aggregates.getMonth(userId, month, 'TAG'),
      this.reference.listTags(userId),
      this.reference.listBudgets(userId),
    ]);
    const names = new Map(tags.map((t) => [t.id, t.name]));
    return rows
      .filter((r) => r.expenseCents > 0)
      .map((r) => {
        const budget =
          budgets.find((b) => b.period === 'MONTHLY' && b.tagIds.length === 1 && b.tagIds[0] === r.dimensionId && !b.categoryIds.length) ??
          budgets.find((b) => b.period === 'MONTHLY' && b.tagIds.includes(r.dimensionId));
        return {
          tagId: r.dimensionId,
          name: names.get(r.dimensionId) ?? 'Removed tag',
          expenseCents: r.expenseCents,
          budgetLimitCents: budget ? budget.limitCents : null,
        };
      })
      .sort((a, b) => b.expenseCents - a.expenseCents);
  }

  /** One point per month in the range; a month without a rollup is zero, not a gap. */
  async totals(userId: string, fromMonth: string, toMonth: string): Promise<MonthTotal[]> {
    const months = monthRange(fromMonth, toMonth).slice(-36);
    const rows = await this.aggregates.getMonths(userId, months);
    const byMonth = new Map(rows.map((r) => [r.bucket.split('#')[1], r]));
    return months.map((month) => ({
      month,
      incomeCents: byMonth.get(month)?.incomeCents ?? 0,
      expenseCents: byMonth.get(month)?.expenseCents ?? 0,
    }));
  }
}
