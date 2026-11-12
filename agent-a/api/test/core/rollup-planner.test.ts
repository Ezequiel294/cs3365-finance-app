import { describe, expect, it } from 'vitest';
import { RollupPlanner } from '../../src/core/rollup-planner';
import { txn } from '../helpers';

const planner = new RollupPlanner();
const byKey = (deltas: ReturnType<RollupPlanner['plan']>) => Object.fromEntries(deltas.map((d) => [d.key, d]));

describe('RollupPlanner', () => {
  it('an expense adds to day, month, category, tag, and budget items', () => {
    const t = txn({ tagIds: ['t-uni'] });
    const d = byKey(planner.plan(null, t, [], [{ budgetId: 'b1', periodStart: '2026-10-01', limitCents: 30000 }]));
    expect(Object.keys(d).sort()).toEqual(
      [
        'BUDGET#b1#D#2026-10-14',
        'BUDGET#b1#P#2026-10-01',
        'DAY#2026-10-14#TOTAL',
        'MONTH#2026-10#CAT#groceries',
        'MONTH#2026-10#TAG#t-uni',
        'MONTH#2026-10#TOTAL',
      ].sort(),
    );
    expect(d['MONTH#2026-10#TOTAL']).toEqual({ key: 'MONTH#2026-10#TOTAL', expenseCents: 5000, incomeCents: 0, count: 1 });
    expect(d['BUDGET#b1#P#2026-10-01']).toMatchObject({ expenseCents: 5000, count: 1, limitCents: 30000 });
  });

  it('income adds incomeCents only and never touches budgets', () => {
    const t = txn({ kind: 'income', categoryId: null });
    const deltas = planner.plan(null, t, [], [{ budgetId: 'b1', periodStart: '2026-10-01', limitCents: 100 }]);
    expect(deltas.every((x) => x.expenseCents === 0 && x.incomeCents === 5000)).toBe(true);
    expect(deltas.some((x) => x.key.startsWith('BUDGET#'))).toBe(false);
    expect(byKey(deltas)['MONTH#2026-10#CAT#uncategorized']).toBeDefined();
  });

  it('a refund subtracts from spending and budgets', () => {
    const d = byKey(planner.plan(null, txn({ kind: 'refund' }), [], [{ budgetId: 'b1', periodStart: '2026-10-01', limitCents: 1 }]));
    expect(d['MONTH#2026-10#TOTAL']!.expenseCents).toBe(-5000);
    expect(d['BUDGET#b1#P#2026-10-01']!.expenseCents).toBe(-5000);
  });

  it('transfers and card payments touch no rollup', () => {
    expect(planner.plan(null, txn({ kind: 'transfer' }))).toEqual([]);
    expect(planner.plan(null, txn({ kind: 'card_payment' }))).toEqual([]);
  });

  it('a category change moves the amount and leaves totals alone', () => {
    const old = txn();
    const next = txn({ categoryId: 'eating-out', tagIds: ['t-x'], version: 2 });
    const d = byKey(planner.plan(old, next));
    expect(d['MONTH#2026-10#TOTAL']).toBeUndefined();
    expect(d['DAY#2026-10-14#TOTAL']).toBeUndefined();
    expect(d['MONTH#2026-10#CAT#groceries']).toMatchObject({ expenseCents: -5000, count: -1 });
    expect(d['MONTH#2026-10#CAT#eating-out']).toMatchObject({ expenseCents: 5000, count: 1 });
    expect(d['MONTH#2026-10#TAG#t-x']).toMatchObject({ expenseCents: 5000 });
  });

  it('changing the kind to a transfer removes it from spending', () => {
    const d = byKey(planner.plan(txn(), txn({ kind: 'transfer' })));
    expect(d['MONTH#2026-10#TOTAL']).toMatchObject({ expenseCents: -5000, count: -1 });
  });

  it('deleting subtracts everything', () => {
    const d = planner.plan(txn(), null, [{ budgetId: 'b1', periodStart: '2026-10-01', limitCents: 1 }], []);
    expect(d.every((x) => x.expenseCents === -5000)).toBe(true);
  });
});
