import { UNCATEGORIZED_ID, type CategoryShare, type MonthTotal, type TagTotal } from "@finance/shared";
import { monthRange } from "../dates";
import { ValidationError } from "../http/errors";
import type { AggregateRepository } from "../repositories/aggregate-repository";
import type { ReferenceRepository } from "../repositories/reference-repository";

/** Read-only views over the precomputed `MONTH#` rollups. Amounts are USD cents. */
export class SpendingAnalyticsService {
  constructor(
    private readonly aggregates: AggregateRepository,
    private readonly reference: ReferenceRepository,
  ) {}

  /** Spending per category for a month, ranked by share. Uncategorized stays as its own row. */
  async byCategory(userId: string, month: string): Promise<CategoryShare[]> {
    const rollups = (await this.aggregates.getMonth(userId, month, "CAT")).filter((r) => r.expenseCents > 0);
    const ids = rollups.map((r) => r.dimensionId!).filter((id) => id !== UNCATEGORIZED_ID);
    const names = new Map((await this.reference.getCategories(userId, ids)).map((c) => [c.id, c.name]));
    const total = rollups.reduce((sum, r) => sum + r.expenseCents, 0);
    return rollups
      .map((r) => ({
        categoryId: r.dimensionId!,
        name: r.dimensionId === UNCATEGORIZED_ID ? "Uncategorized" : names.get(r.dimensionId!) ?? r.dimensionId!,
        expenseCents: r.expenseCents,
        share: total > 0 ? r.expenseCents / total : 0,
      }))
      .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
  }

  /** Spending per tag for a month. Tag totals can overlap: a transaction with two tags counts in both. */
  async byTag(userId: string, month: string): Promise<TagTotal[]> {
    const rollups = (await this.aggregates.getMonth(userId, month, "TAG")).filter((r) => r.expenseCents > 0);
    const names = new Map((await this.reference.getTags(userId, rollups.map((r) => r.dimensionId!))).map((t) => [t.id, t.name]));
    return rollups
      .map((r) => ({ tagId: r.dimensionId!, name: names.get(r.dimensionId!) ?? r.dimensionId!, expenseCents: r.expenseCents }))
      .sort((a, b) => b.expenseCents - a.expenseCents || a.name.localeCompare(b.name));
  }

  /** One point per month in the range; months with no rollup are income 0 and expense 0, not gaps. */
  async totals(userId: string, fromMonth: string, toMonth: string): Promise<MonthTotal[]> {
    if (fromMonth > toMonth) throw new ValidationError("from must not be after to");
    const months = monthRange(fromMonth, toMonth);
    if (months.length > 36) throw new ValidationError("the range can cover at most 36 months");
    const rollups = await this.aggregates.getMonths(userId, months);
    const byMonth = new Map(rollups.map((r) => [r.bucket, r]));
    return months.map((month) => ({
      month,
      incomeCents: byMonth.get(month)?.incomeCents ?? 0,
      expenseCents: byMonth.get(month)?.expenseCents ?? 0,
    }));
  }
}
