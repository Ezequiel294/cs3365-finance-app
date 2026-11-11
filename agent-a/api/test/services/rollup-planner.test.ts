import type { Transaction } from '@finance/shared';
import { describe, expect, it } from 'vitest';
import { RollupPlanner } from '../../src/services/rollup-planner';

const base: Transaction = {
  id: '20261014-a',
  userId: 'u',
  accountId: 'acc',
  localDate: '2026-10-14',
  occurredAt: null,
  kind: 'purchase',
  status: 'confirmed',
  currency: 'CRC',
  amountMinor: 1400000,
  amountUsdCents: 2740,
  fxRate: 510.95,
  fxDate: '2026-10-14',
  categoryId: 'groceries',
  tagIds: ['university'],
  categorizedBy: 'user',
  merchantRaw: 'AUTOMERCADO',
  merchantKey: 'automercado',
  sources: ['manual'],
  version: 1,
  createdAt: '',
  updatedAt: '',
};

const budget = { budgetId: 'b1', periodStart: '2026-10-01', limitCents: 30000 };
const planner = new RollupPlanner();
const byKey = (deltas: ReturnType<RollupPlanner['plan']>) => Object.fromEntries(deltas.map((d) => [d.key, d]));

describe('RollupPlanner', () => {
  it('adds an expense to day, month, category, tag, and budget items', () => {
    const d = byKey(planner.plan(null, base, [], [budget]));
    expect(Object.keys(d).sort()).toEqual([
      'BUDGET#b1#D#2026-10-14',
      'BUDGET#b1#P#2026-10-01',
      'DAY#2026-10-14#TOTAL',
      'MONTH#2026-10#CAT#groceries',
      'MONTH#2026-10#TAG#university',
      'MONTH#2026-10#TOTAL',
    ]);
    expect(d['MONTH#2026-10#TOTAL']).toMatchObject({ expenseCents: 2740, incomeCents: 0, count: 1 });
    expect(d['BUDGET#b1#P#2026-10-01']).toMatchObject({ expenseCents: 2740, count: 1, limitCents: 30000 });
  });

  it('subtracts a refund from spending and budgets', () => {
    const d = byKey(planner.plan(null, { ...base, kind: 'refund' }, [], [budget]));
    expect(d['MONTH#2026-10#TOTAL'].expenseCents).toBe(-2740);
    expect(d['BUDGET#b1#P#2026-10-01'].expenseCents).toBe(-2740);
  });

  it('adds income to incomeCents only and never to budgets', () => {
    const d = byKey(planner.plan(null, { ...base, kind: 'sinpe_received', tagIds: [] }, [], [budget]));
    expect(d['MONTH#2026-10#TOTAL']).toMatchObject({ incomeCents: 2740, expenseCents: 0 });
    expect(d['BUDGET#b1#P#2026-10-01']).toBeUndefined();
  });

  it('keeps transfers and card payments out of every rollup', () => {
    expect(planner.plan(null, { ...base, kind: 'transfer' }, [], [budget])).toEqual([]);
    expect(planner.plan(null, { ...base, kind: 'card_payment' }, [], [budget])).toEqual([]);
  });

  it('moves the amount between categories on an edit, merging keys and dropping zeros', () => {
    const next = { ...base, categoryId: 'eating-out', version: 2 };
    const d = byKey(planner.plan(base, next, [budget], []));
    expect(d['MONTH#2026-10#CAT#groceries']).toMatchObject({ expenseCents: -2740, count: -1 });
    expect(d['MONTH#2026-10#CAT#eating-out']).toMatchObject({ expenseCents: 2740, count: 1 });
    expect(d['MONTH#2026-10#TOTAL']).toBeUndefined();
    expect(d['MONTH#2026-10#TAG#university']).toBeUndefined();
    expect(d['BUDGET#b1#P#2026-10-01']).toMatchObject({ expenseCents: -2740, count: -1 });
  });

  it('files an uncategorized transaction under its own category row', () => {
    const d = byKey(planner.plan(null, { ...base, categoryId: null, tagIds: [] }));
    expect(d['MONTH#2026-10#CAT#uncategorized'].expenseCents).toBe(2740);
  });

  it('subtracts everything when a transaction is deleted', () => {
    const d = planner.plan(base, null, [budget], []);
    expect(d.every((x) => x.expenseCents === -2740)).toBe(true);
  });
});
