import { describe, expect, it, vi } from 'vitest';
import type { Budget } from '../../../shared/types';
import { BudgetAnalyticsService } from '../../src/budgets/budget-analytics-service';
import { BudgetMatcher } from '../../src/budgets/budget-matcher';
import { BudgetService } from '../../src/budgets/budget-service';
import { PeriodCalculator } from '../../src/budgets/period-calculator';
import { FixedClock } from '../../src/clock';
import { USER, txn } from '../helpers';

const pc = new PeriodCalculator();
const budget = (o: Partial<Budget> = {}): Budget => ({
  id: 'b1',
  name: 'Clothing',
  categoryIds: ['clothing'],
  tagIds: [],
  period: 'MONTHLY',
  limitCents: 9000,
  startDate: null,
  endDate: null,
  version: 1,
  ...o,
});

describe('PeriodCalculator', () => {
  it('weeks start on the chosen day', () => {
    // 2026-10-14 is a Wednesday
    expect(pc.periodStart('2026-10-14', budget({ period: 'WEEKLY' }), 'MONDAY')).toBe('2026-10-12');
    expect(pc.periodStart('2026-10-14', budget({ period: 'WEEKLY' }), 'SUNDAY')).toBe('2026-10-11');
    expect(pc.periodStart('2026-10-11', budget({ period: 'WEEKLY' }), 'SUNDAY')).toBe('2026-10-11');
  });
  it('months, quarters, years, and custom ranges', () => {
    expect(pc.periodStart('2026-11-30', budget(), 'MONDAY')).toBe('2026-11-01');
    expect(pc.periodStart('2026-11-30', budget({ period: 'QUARTERLY' }))).toBe('2026-10-01');
    expect(pc.periodEnd('2026-10-01', budget({ period: 'QUARTERLY' }))).toBe('2026-12-31');
    expect(pc.periodStart('2026-11-30', budget({ period: 'YEARLY' }))).toBe('2026-01-01');
    const custom = budget({ period: 'CUSTOM', startDate: '2026-08-01', endDate: '2026-12-15' });
    expect(pc.periodStart('2026-09-10', custom)).toBe('2026-08-01');
    expect(pc.periodStart('2026-12-16', custom)).toBeNull();
    expect(pc.daysInPeriod('2026-02-01', budget())).toBe(28);
  });
  it('lists the last periods oldest first', () => {
    expect(pc.periods(budget(), 3, '2026-01-15')).toEqual(['2025-11-01', '2025-12-01', '2026-01-01']);
    expect(pc.periods(budget({ period: 'WEEKLY' }), 2, '2026-10-14', 'MONDAY')).toEqual(['2026-10-05', '2026-10-12']);
  });
});

describe('BudgetMatcher', () => {
  const m = new BudgetMatcher();
  it('category and any-of tags; empty lists match all spending', () => {
    expect(m.matches(txn({ categoryId: 'clothing' }), budget())).toBe(true);
    expect(m.matches(txn({ categoryId: 'groceries' }), budget())).toBe(false);
    expect(m.matches(txn({ tagIds: ['u'] }), budget({ categoryIds: [], tagIds: ['u', 'v'] }))).toBe(true);
    expect(m.matches(txn({ tagIds: [] }), budget({ categoryIds: [], tagIds: ['u'] }))).toBe(false);
    expect(m.matches(txn(), budget({ categoryIds: [], tagIds: [] }))).toBe(true);
  });
  it('income, transfers, and card payments never count', () => {
    const all = budget({ categoryIds: [] });
    expect(m.matches(txn({ kind: 'income' }), all)).toBe(false);
    expect(m.matches(txn({ kind: 'transfer' }), all)).toBe(false);
    expect(m.matches(txn({ kind: 'refund' }), all)).toBe(true);
  });
  it('returns the period key for the transaction date', () => {
    expect(m.matching(txn({ localDate: '2026-10-14', categoryId: 'clothing' }), [budget({ period: 'WEEKLY' })], 'SUNDAY')).toEqual([
      { budgetId: 'b1', periodStart: '2026-10-11', limitCents: 9000 },
    ]);
  });
});

describe('BudgetAnalyticsService (03-S11)', () => {
  const clock = new FixedClock(new Date('2026-11-15T18:00:00Z'));
  const svc = (spent: number, b = budget()) =>
    new BudgetAnalyticsService(
      { listBudgets: async () => [b], getBudget: async () => b, getSettings: async () => null },
      {
        getBudgetPeriods: async (_u, keys) => keys.map((k) => ({ ...k, spentCents: spent, count: 3, limitCents: b.limitCents })),
        getBudgetDays: async () => [
          { budgetId: 'b1', date: '2026-11-02', spentCents: 5000 },
          { budgetId: 'b1', date: '2026-11-10', spentCents: 8600 },
        ],
      },
      pc,
      clock,
    );

  it('shows over 100% and the amount over', async () => {
    const [p] = await svc(13600).progress(USER);
    expect(p).toMatchObject({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      spentCents: 13600,
      limitCents: 9000,
      percent: 151,
      overByCents: 4600,
      remainingCents: -4600,
      daysLeft: 15,
      expectedCents: 4500,
    });
  });

  it('burn-down: cumulative to today, pace for every day', async () => {
    const s = await svc(13600).burndown(USER, 'b1');
    expect(s.dates).toHaveLength(30);
    expect(s.cumulativeSpentCents).toHaveLength(15);
    expect(s.cumulativeSpentCents[0]).toBe(0);
    expect(s.cumulativeSpentCents[1]).toBe(5000);
    expect(s.cumulativeSpentCents[14]).toBe(13600);
    expect(s.paceCents[29]).toBe(9000);
    expect(s.paceCents[14]).toBe(4500);
    expect(s.limitCents).toBe(9000);
  });
});

describe('BudgetService (03-S02, 03-S10)', () => {
  it('backfills the current and earlier periods from Transactions', async () => {
    const replace = vi.fn(async () => undefined);
    const svc = new BudgetService(
      {
        getCategories: async (_u, ids) => ids.map((id) => ({ id, name: id, scope: 'global' as const, archived: false })),
        getTags: async () => [],
        putBudget: async () => undefined,
        updateBudget: async () => undefined,
        getBudget: async () => null,
        listBudgets: async () => [],
        getSettings: async () => null,
      },
      {
        listByDate: async () => [
          txn({ localDate: '2026-11-02', categoryId: 'clothing', amountUsdCents: 5000 }),
          txn({ localDate: '2026-10-20', categoryId: 'clothing', amountUsdCents: 3000 }),
          txn({ localDate: '2026-10-21', categoryId: 'clothing', amountUsdCents: 1000, kind: 'refund' }),
          txn({ localDate: '2026-10-21', categoryId: 'groceries', amountUsdCents: 9999 }),
        ],
      },
      { replaceBudgetItems: replace },
      new BudgetMatcher(),
      pc,
      new FixedClock(new Date('2026-11-15T18:00:00Z')),
    );
    const b = await svc.create(USER, { name: 'Clothing', categoryIds: ['clothing'], tagIds: [], period: 'MONTHLY', limitCents: 9000 });
    expect(b.version).toBe(1);
    const [, , periods, days] = replace.mock.calls[0] as unknown as [string, string, any[], any[]];
    expect(periods).toEqual(
      expect.arrayContaining([
        { budgetId: b.id, periodStart: '2026-11-01', spentCents: 5000, count: 1, limitCents: 9000 },
        { budgetId: b.id, periodStart: '2026-10-01', spentCents: 2000, count: 2, limitCents: 9000 },
      ]),
    );
    expect(days).toHaveLength(3);
  });
});
