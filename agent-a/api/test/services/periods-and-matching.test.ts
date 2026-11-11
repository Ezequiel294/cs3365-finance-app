import type { Budget, Transaction } from '@finance/shared';
import { describe, expect, it } from 'vitest';
import { BudgetMatcher } from '../../src/services/budget-matcher';
import { Normalizer } from '../../src/services/normalizer';
import { PeriodCalculator } from '../../src/services/period-calculator';

const pc = new PeriodCalculator();
const budget = (b: Partial<Budget>): Budget => ({
  id: 'b1', name: 'B', categoryIds: [], tagIds: [], period: 'MONTHLY', limitCents: 9000, version: 1, ...b,
});

describe('PeriodCalculator', () => {
  it('finds period starts', () => {
    // 2026-10-14 is a Wednesday
    expect(pc.periodStart('2026-10-14', budget({ period: 'WEEKLY' }), 'MONDAY')).toBe('2026-10-12');
    expect(pc.periodStart('2026-10-14', budget({ period: 'WEEKLY' }), 'SUNDAY')).toBe('2026-10-11');
    expect(pc.periodStart('2026-10-12', budget({ period: 'WEEKLY' }), 'MONDAY')).toBe('2026-10-12');
    expect(pc.periodStart('2026-10-14', budget({ period: 'MONTHLY' }))).toBe('2026-10-01');
    expect(pc.periodStart('2026-11-14', budget({ period: 'QUARTERLY' }))).toBe('2026-10-01');
    expect(pc.periodStart('2026-10-14', budget({ period: 'YEARLY' }))).toBe('2026-01-01');
    const custom = budget({ period: 'CUSTOM', startDate: '2026-10-05', endDate: '2026-10-20' });
    expect(pc.periodStart('2026-10-14', custom)).toBe('2026-10-05');
    expect(pc.periodStart('2026-10-21', custom)).toBeNull();
  });

  it('lists the last 12 periods, oldest first', () => {
    const months = pc.periods(budget({ period: 'MONTHLY' }), 12, '2026-10-14');
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-11-01');
    expect(months[11]).toBe('2026-10-01');
    const weeks = pc.periods(budget({ period: 'WEEKLY' }), 3, '2026-10-14', 'MONDAY');
    expect(weeks).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
  });

  it('counts days in a period', () => {
    expect(pc.daysInPeriod('2026-02-01', budget({ period: 'MONTHLY' }))).toBe(28);
    expect(pc.daysInPeriod('2026-10-12', budget({ period: 'WEEKLY' }))).toBe(7);
    expect(pc.daysInPeriod('2028-01-01', budget({ period: 'YEARLY' }))).toBe(366);
    expect(pc.daysInPeriod('2026-10-01', budget({ period: 'QUARTERLY' }))).toBe(92);
  });
});

describe('BudgetMatcher', () => {
  const m = new BudgetMatcher();
  const txn = { kind: 'purchase', categoryId: 'groceries', tagIds: ['university'], localDate: '2026-10-14' } as Transaction;

  it('matches category and any of the tags, empty lists meaning all', () => {
    expect(m.matches(txn, budget({}))).toBe(true);
    expect(m.matches(txn, budget({ categoryIds: ['groceries'] }))).toBe(true);
    expect(m.matches(txn, budget({ categoryIds: ['rent'] }))).toBe(false);
    expect(m.matches(txn, budget({ tagIds: ['hobby', 'university'] }))).toBe(true);
    expect(m.matches(txn, budget({ tagIds: ['hobby'] }))).toBe(false);
    expect(m.matches(txn, budget({ categoryIds: ['groceries'], tagIds: ['hobby'] }))).toBe(false);
  });

  it('never matches income or transfers', () => {
    expect(m.matches({ ...txn, kind: 'income' }, budget({}))).toBe(false);
    expect(m.matches({ ...txn, kind: 'transfer' }, budget({}))).toBe(false);
    expect(m.matches({ ...txn, kind: 'refund' }, budget({}))).toBe(true);
  });

  it('returns each matching budget with its period key', () => {
    const res = m.matching(txn, [budget({ id: 'a' }), budget({ id: 'w', period: 'WEEKLY' }), budget({ id: 'x', tagIds: ['hobby'] })], 'MONDAY');
    expect(res).toEqual([
      { budgetId: 'a', periodStart: '2026-10-01', limitCents: 9000 },
      { budgetId: 'w', periodStart: '2026-10-12', limitCents: 9000 },
    ]);
  });
});

describe('Normalizer', () => {
  const n = new Normalizer();
  it.each([
    ['AUTOMERCADO ESCAZU 042', 'automercado'],
    ['Spotify', 'spotify'],
    ['SPOTIFY P1234ABC', 'spotify'],
    ['DTR:inversiones_hapi_VT', 'dtr-inversiones-hapi-vt'],
    ['FM ESC AVENIDA ESCAZU', 'fm-esc-avenida'],
    ['Pago Liberty Móvil (Movistar 8', 'pago-liberty-movil-movistar'],
    ['TEF A : 123456781', 'tef-a'],
    ['123456', 'unknown'],
  ])('%s → %s', (raw, key) => {
    expect(n.normalize(raw)).toBe(key);
  });
});
