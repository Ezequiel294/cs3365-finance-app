import type { CategoryShare, MonthTotal, TagTotal } from '@finance/shared';
import { UNCATEGORIZED } from '../keys';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import type { ReferenceRepository } from '../repositories/reference-repository';

/** Every month from `from` to `to` inclusive, as yyyy-mm. */
export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (months.length > 120) break;
  }
  return months;
}

/** Read-only views over the precomputed `MONTH#` rollups (module 04). */
export class SpendingAnalyticsService {
  constructor(
    private readonly aggregates: AggregateRepository,
    private readonly reference: ReferenceRepository,
  ) {}

  /** Spending per category for a month, ranked by share. Uncategorized stays its own row. */
  async byCategory(userId: string, month: string): Promise<CategoryShare[]> {
    const rows = (await this.aggregates.getMonth(userId, month, 'CAT')).filter((r) => r.expenseCents !== 0);
    const ids = rows.map((r) => r.dimensionId!).filter((id) => id !== UNCATEGORIZED);
    const names = new Map((await this.reference.getCategories(userId, ids)).map((c) => [c.id, c.name]));
    const total = rows.reduce((sum, r) => sum + Math.max(0, r.expenseCents), 0);
    return rows
      .map((r) => ({
        categoryId: r.dimensionId === UNCATEGORIZED ? null : r.dimensionId,
        name: r.dimensionId === UNCATEGORIZED ? 'Uncategorized' : names.get(r.dimensionId!) ?? r.dimensionId!,
        expenseCents: r.expenseCents,
        share: total > 0 ? Math.max(0, r.expenseCents) / total : 0,
      }))
      .sort((a, b) => b.expenseCents - a.expenseCents);
  }

  /** Spending per tag for a month. Totals can overlap: a transaction with two tags counts in both. */
  async byTag(userId: string, month: string): Promise<TagTotal[]> {
    const rows = (await this.aggregates.getMonth(userId, month, 'TAG')).filter((r) => r.expenseCents !== 0);
    const [tags, budgets] = await Promise.all([
      this.reference.getTags(userId, rows.map((r) => r.dimensionId!)),
      this.reference.listBudgets(userId),
    ]);
    const names = new Map(tags.map((t) => [t.id, t.name]));
    return rows
      .map((r) => {
        const budget = budgets.find((b) => b.period === 'MONTHLY' && b.tagIds.includes(r.dimensionId!));
        return {
          tagId: r.dimensionId!,
          name: names.get(r.dimensionId!) ?? r.dimensionId!,
          expenseCents: r.expenseCents,
          budgetLimitCents: budget ? budget.limitCents : null,
        };
      })
      .sort((a, b) => b.expenseCents - a.expenseCents);
  }

  /** One point per month in the range; months without a rollup are zero, not gaps. */
  async totals(userId: string, fromMonth: string, toMonth: string): Promise<MonthTotal[]> {
    const months = monthRange(fromMonth, toMonth);
    const rows = await this.aggregates.getMonths(userId, months);
    const byMonth = new Map(rows.map((r) => [r.bucket, r]));
    return months.map((month) => ({
      month,
      incomeCents: byMonth.get(month)?.incomeCents ?? 0,
      expenseCents: byMonth.get(month)?.expenseCents ?? 0,
    }));
  }
}
