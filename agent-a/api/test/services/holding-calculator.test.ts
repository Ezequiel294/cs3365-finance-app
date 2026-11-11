import type { Holding, InvestmentTransaction } from '@finance/shared';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../src/errors';
import { HoldingCalculator } from '../../src/services/holding-calculator';

const calc = new HoldingCalculator();
const tx = (t: Partial<InvestmentTransaction>): InvestmentTransaction => ({
  id: 'x', userId: 'u', brokerId: 'brk-hapi', type: 'BUY', localDate: '2026-10-01', ticker: 'VT', assetClass: 'SECURITY',
  quantityMicro: 0, grossCents: 0, amountCents: null, commissionCents: 0, commissionSource: 'rule', version: 1, createdAt: '2026-10-01T00:00:00Z', ...t,
});

describe('HoldingCalculator', () => {
  it('adds units and cost (gross + fee) on a buy', () => {
    const h = calc.applyBuy(null, tx({ quantityMicro: 653300, grossCents: 10122, commissionCents: 15 }));
    expect(h).toMatchObject({ ticker: 'VT', quantityMicro: 653300, costBasisCents: 10137, realizedGainCents: 0 });
  });

  it('removes average cost on a sell and records the realized gain', () => {
    const holding: Holding = { brokerId: 'brk-hapi', ticker: 'VT', assetClass: 'SECURITY', quantityMicro: 2_000_000, costBasisCents: 30000, realizedGainCents: 0, version: 2 };
    const r = calc.applySell(holding, tx({ type: 'SELL', quantityMicro: 500_000, grossCents: 9000, commissionCents: 15 }));
    expect(r.costRemovedCents).toBe(7500);
    expect(r.realizedGainCents).toBe(9000 - 15 - 7500);
    expect(r.holding).toMatchObject({ quantityMicro: 1_500_000, costBasisCents: 22500, realizedGainCents: 1485 });
  });

  it('rejects a sale larger than the holding', () => {
    const holding: Holding = { brokerId: 'b', ticker: 'VT', assetClass: 'SECURITY', quantityMicro: 100, costBasisCents: 1, realizedGainCents: 0, version: 1 };
    expect(() => calc.applySell(holding, tx({ type: 'SELL', quantityMicro: 101, grossCents: 1 }))).toThrow(ConflictError);
  });

  it('replays trades in date order so a corrected old buy changes later sales', () => {
    const trades = [
      tx({ id: 's1', type: 'SELL', localDate: '2026-10-05', quantityMicro: 1_000_000, grossCents: 12000 }),
      tx({ id: 'b1', type: 'BUY', localDate: '2026-10-01', quantityMicro: 2_000_000, grossCents: 20000 }),
    ];
    const r = calc.replay(trades);
    expect(r.holding).toMatchObject({ quantityMicro: 1_000_000, costBasisCents: 10000, realizedGainCents: 2000 });
    expect(r.realizedById.get('s1')).toBe(2000);
  });

  it('computes the cash effect of each type', () => {
    expect(calc.cashDelta(tx({ type: 'DEPOSIT', amountCents: 30000, commissionCents: 465 }))).toBe(29535);
    expect(calc.cashDelta(tx({ type: 'BUY', grossCents: 20000, commissionCents: 200 }))).toBe(-20200);
    expect(calc.cashDelta(tx({ type: 'SELL', grossCents: 9000, commissionCents: 15 }))).toBe(8985);
    expect(calc.cashDelta(tx({ type: 'WITHDRAWAL', amountCents: 10000, commissionCents: 2500 }))).toBe(-10000);
  });
});
