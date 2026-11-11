import type { Budget } from '@finance/shared';
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/clock';
import { BudgetAnalyticsService } from '../../src/services/budget-analytics-service';
import { PeriodCalculator } from '../../src/services/period-calculator';
import { SpendingAnalyticsService } from '../../src/services/spending-analytics-service';

const clothing: Budget = { id: 'clothing', name: 'Clothing', categoryIds: ['clothing'], tagIds: [], period: 'MONTHLY', limitCents: 9000, version: 1 };
const university: Budget = { id: 'uni', name: 'University', categoryIds: [], tagIds: ['university'], period: 'MONTHLY', limitCents: 30000, version: 1 };

const reference = {
  getSettings: async () => ({ userId: 'u', timeZone: 'America/Costa_Rica', weekStart: 'MONDAY', baseCurrency: 'USD' }),
  listBudgets: async () => [clothing, university],
  getBudget: async (_u: string, id: string) => [clothing, university].find((b) => b.id === id),
  getCategories: async (_u: string, ids: string[]) => ids.map((id) => ({ id, name: id === 'eating' ? 'Eating out' : 'Groceries', scope: 'GLOBAL', archived: false })),
  getTags: async (_u: string, ids: string[]) => ids.map((id) => ({ id, name: 'University', scope: 'USER', archived: false })),
};

describe('BudgetAnalyticsService', () => {
  const aggregates = {
    getBudgetPeriods: async (_u: string, keys: { budgetId: string; periodStart: string }[]) =>
      keys.filter((k) => k.budgetId === 'clothing').map((k) => ({ ...k, spentCents: 13600, count: 3, limitCents: 9000 })),
    getBudgetDays: async () => [
      { budgetId: 'clothing', date: '2026-10-02', spentCents: 5000 },
      { budgetId: 'clothing', date: '2026-10-04', spentCents: 8600 },
    ],
  };
  const service = new BudgetAnalyticsService(reference as never, aggregates as never, new PeriodCalculator(), new FixedClock(new Date('2026-10-04T18:00:00Z')));

  it('reports percent above 100 and the amount over (03-S11)', async () => {
    const [c, u] = await service.progress('u');
    expect(c).toMatchObject({ periodStart: '2026-10-01', periodEnd: '2026-10-31', spentCents: 13600, limitCents: 9000, remainingCents: -4600, percent: 151, overByCents: 4600 });
    expect(u).toMatchObject({ spentCents: 0, percent: 0, remainingCents: 30000, overByCents: 0 });
  });

  it('builds the burn-down with cumulative spending and the even-pace line', async () => {
    const b = await service.burndown('u', 'clothing');
    expect(b.dates).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(b.cumulativeSpentCents).toEqual([0, 5000, 5000, 13600]);
    expect(b.paceCents).toEqual([290, 581, 871, 1161]);
  });
});

describe('SpendingAnalyticsService', () => {
  const aggregates = {
    getMonth: async (_u: string, _m: string, dim: string) =>
      dim === 'CAT'
        ? [
            { bucket: '2026-10', dimension: 'CAT', dimensionId: 'eating', expenseCents: 3400, incomeCents: 0, count: 4 },
            { bucket: '2026-10', dimension: 'CAT', dimensionId: 'uncategorized', expenseCents: 1600, incomeCents: 0, count: 2 },
            { bucket: '2026-10', dimension: 'CAT', dimensionId: 'groceries', expenseCents: 5000, incomeCents: 0, count: 5 },
            { bucket: '2026-10', dimension: 'CAT', dimensionId: 'salary', expenseCents: 0, incomeCents: 90000, count: 1 },
          ]
        : [{ bucket: '2026-10', dimension: 'TAG', dimensionId: 'university', expenseCents: 28600, incomeCents: 0, count: 6 }],
    getMonths: async () => [
      { bucket: '2026-09', dimension: 'TOTAL', dimensionId: null, expenseCents: 50000, incomeCents: 0, count: 9 },
      { bucket: '2026-10', dimension: 'TOTAL', dimensionId: null, expenseCents: 10000, incomeCents: 90000, count: 12 },
    ],
  };
  const service = new SpendingAnalyticsService(aggregates as never, reference as never);

  it('ranks categories by share and keeps Uncategorized as its own row (04-S01)', async () => {
    const rows = await service.byCategory('u', '2026-10');
    expect(rows.map((r) => [r.name, r.share])).toEqual([
      ['Groceries', 0.5],
      ['Eating out', 0.34],
      ['Uncategorized', 0.16],
    ]);
    expect(rows[2].categoryId).toBeNull();
  });

  it('lists tag totals with the limit of a budget on that tag (04-S03)', async () => {
    expect(await service.byTag('u', '2026-10')).toEqual([{ tagId: 'university', name: 'University', expenseCents: 28600, budgetLimitCents: 30000 }]);
  });

  it('returns one point per month, with zero for months without a rollup (04-S06)', async () => {
    const points = await service.totals('u', '2026-08', '2026-11');
    expect(points).toEqual([
      { month: '2026-08', incomeCents: 0, expenseCents: 0 },
      { month: '2026-09', incomeCents: 0, expenseCents: 50000 },
      { month: '2026-10', incomeCents: 90000, expenseCents: 10000 },
      { month: '2026-11', incomeCents: 0, expenseCents: 0 },
    ]);
  });
});
