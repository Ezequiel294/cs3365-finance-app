import type { Budget, Transaction } from '@finance/shared';
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/clock';
import { ConflictError, ValidationError } from '../../src/errors';
import { ConditionFailedError } from '../../src/repositories/dynamo-store';
import { BudgetMatcher } from '../../src/services/budget-matcher';
import { BudgetService } from '../../src/services/budget-service';
import { PeriodCalculator } from '../../src/services/period-calculator';

const txn = (t: Partial<Transaction>) => ({ kind: 'purchase', categoryId: 'groceries', tagIds: [], amountUsdCents: 1000, ...t }) as Transaction;

function build() {
  const budgets = new Map<string, Budget>();
  const replaced: { periods: unknown[]; days: unknown[] }[] = [];
  const queried: [string, string][] = [];
  const reference = {
    getSettings: async () => ({ userId: 'u', timeZone: 'America/Costa_Rica', weekStart: 'MONDAY', baseCurrency: 'USD' }),
    getCategories: async (_u: string, ids: string[]) => ids.filter((i) => i === 'groceries').map((id) => ({ id, name: id, scope: 'GLOBAL', archived: false })),
    getTags: async (_u: string, ids: string[]) => ids.filter((i) => i === 'university').map((id) => ({ id, name: id, scope: 'USER', archived: false })),
    putBudget: async (_u: string, b: Budget) => void budgets.set(b.id, b),
    getBudget: async (_u: string, id: string) => budgets.get(id),
    updateBudget: async (_u: string, b: Budget, v: number) => {
      if (budgets.get(b.id)?.version !== v) throw new ConditionFailedError();
      budgets.set(b.id, b);
    },
  };
  const transactions = {
    listByDate: async (_u: string, from: string, to: string) => {
      queried.push([from, to]);
      return [
        txn({ localDate: '2026-10-02', amountUsdCents: 5000 }),
        txn({ localDate: '2026-10-13', amountUsdCents: 2000 }),
        txn({ localDate: '2026-10-13', kind: 'refund', amountUsdCents: 500 }),
        txn({ localDate: '2026-09-15', amountUsdCents: 1500 }),
        txn({ localDate: '2026-10-14', kind: 'transfer', amountUsdCents: 99999 }),
        txn({ localDate: '2026-10-14', categoryId: 'rent', amountUsdCents: 88888 }),
      ];
    },
  };
  const aggregates = {
    replaceBudgetItems: async (_u: string, _id: string, periods: unknown[], days: unknown[]) => void replaced.push({ periods, days }),
    setBudgetLimit: async () => undefined,
  };
  const service = new BudgetService(reference as never, transactions as never, aggregates as never, new BudgetMatcher(), new PeriodCalculator(), new FixedClock(new Date('2026-10-14T18:00:00Z')));
  return { service, budgets, replaced, queried };
}

describe('BudgetService', () => {
  it('creates a budget and backfills the current and 11 earlier periods (03-S02)', async () => {
    const { service, replaced, queried } = build();
    const b = await service.create('u', { name: 'Groceries', categoryIds: ['groceries'], tagIds: [], period: 'MONTHLY', limitCents: 30000 });
    expect(b.version).toBe(1);
    expect(queried[0]).toEqual(['2025-11-01', '2026-10-31']);
    const periods = replaced[0].periods as { periodStart: string; spentCents: number; count: number }[];
    expect(periods).toHaveLength(12);
    expect(periods.find((p) => p.periodStart === '2026-10-01')).toMatchObject({ spentCents: 6500, count: 3 });
    expect(periods.find((p) => p.periodStart === '2026-09-01')).toMatchObject({ spentCents: 1500, count: 1 });
    expect(replaced[0].days).toContainEqual({ budgetId: b.id, date: '2026-10-13', spentCents: 1500 });
  });

  it('rebuilds with weekly periods when the period changes (03-S10)', async () => {
    const { service, replaced } = build();
    const b = await service.create('u', { name: 'Groceries', categoryIds: ['groceries'], tagIds: [], period: 'MONTHLY', limitCents: 30000 });
    const updated = await service.update('u', b.id, { period: 'WEEKLY', version: 1 });
    expect(updated).toMatchObject({ period: 'WEEKLY', version: 2 });
    const weeks = replaced[1].periods as { periodStart: string; spentCents: number }[];
    expect(weeks[weeks.length - 1]).toMatchObject({ periodStart: '2026-10-12', spentCents: 1500 });
    expect(weeks.find((w) => w.periodStart === '2026-09-28')).toMatchObject({ spentCents: 5000 });
  });

  it('answers 409 when the budget changed meanwhile', async () => {
    const { service } = build();
    const b = await service.create('u', { name: 'G', categoryIds: [], tagIds: [], period: 'MONTHLY', limitCents: 100 });
    await expect(service.update('u', b.id, { limitCents: 200, version: 7 })).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects unknown categories and tags', async () => {
    const { service } = build();
    await expect(service.create('u', { name: 'G', categoryIds: ['nope'], tagIds: [], period: 'MONTHLY', limitCents: 100 })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.create('u', { name: 'G', categoryIds: [], tagIds: ['nope'], period: 'MONTHLY', limitCents: 100 })).rejects.toBeInstanceOf(ValidationError);
  });
});
