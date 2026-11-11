import { describe, expect, it } from 'vitest';
import { emptyFeeSchedule, FeeCalculator, feeFor } from '../src/fee-calculator';
import type { Broker } from '../src/types';

const hapi: Broker = {
  id: 'brk-hapi',
  name: 'Hapi',
  version: 1,
  fees: {
    deposit: { flatCents: 0, percentBps: 155 },
    withdrawal: { flatCents: 2500, percentBps: 0 },
    buy: { security: { flatCents: 15, percentBps: 0 }, crypto: { flatCents: 0, percentBps: 100 } },
    sell: { security: { flatCents: 15, percentBps: 0 }, crypto: { flatCents: 0, percentBps: 100 } },
  },
};

describe('FeeCalculator', () => {
  it('computes flat plus percentage with half-even rounding', () => {
    expect(FeeCalculator.fee({ flatCents: 0, percentBps: 155 }, 30000)).toBe(465);
    expect(FeeCalculator.fee({ flatCents: 15, percentBps: 0 }, 10122)).toBe(15);
    expect(FeeCalculator.fee({ flatCents: 0, percentBps: 100 }, 20000)).toBe(200);
    // 50 × 1% = 0.5 → rounds to even (0); 150 × 1% = 1.5 → 2
    expect(FeeCalculator.fee({ flatCents: 0, percentBps: 100 }, 50)).toBe(0);
    expect(FeeCalculator.fee({ flatCents: 0, percentBps: 100 }, 150)).toBe(2);
    expect(FeeCalculator.fee({ flatCents: 10, percentBps: 50 }, 10000)).toBe(60);
  });

  it('grosses up an arrival amount to the amount sent', () => {
    expect(FeeCalculator.grossUp({ flatCents: 0, percentBps: 155 }, 29535)).toBe(30000);
    const gross = FeeCalculator.grossUp({ flatCents: 100, percentBps: 200 }, 9700);
    expect(gross - FeeCalculator.fee({ flatCents: 100, percentBps: 200 }, gross)).toBe(9700);
  });

  it('explains fees in words', () => {
    expect(FeeCalculator.explain({ flatCents: 0, percentBps: 155 }, 30000)).toBe('1.55% of $300.00 = $4.65');
    expect(FeeCalculator.explain({ flatCents: 15, percentBps: 0 }, 10122)).toBe('$0.15 flat');
    expect(FeeCalculator.explain({ flatCents: 0, percentBps: 0 }, 10122)).toBe('no fee');
  });

  it('suggests the broker fee for each operation and asset class', () => {
    expect(FeeCalculator.suggest(hapi, 'DEPOSIT', null, 30000)).toEqual({
      commissionCents: 465,
      netCents: 29535,
      explanation: 'Hapi deposit fee: 1.55% of $300.00 = $4.65',
    });
    expect(FeeCalculator.suggest(hapi, 'BUY', 'CRYPTO', 20000).explanation).toBe('Hapi buy fee, crypto: 1% of $200.00 = $2.00');
    expect(FeeCalculator.suggest(hapi, 'BUY', 'SECURITY', 10122).explanation).toBe('Hapi buy fee, stocks and ETFs: $0.15 flat');
    expect(FeeCalculator.suggest(hapi, 'BUY', 'SECURITY', 10122).netCents).toBe(10137);
  });

  it('picks the fee entry with feeFor', () => {
    expect(feeFor(hapi.fees, 'WITHDRAWAL')).toEqual({ flatCents: 2500, percentBps: 0 });
    expect(feeFor(hapi.fees, 'SELL', 'CRYPTO')).toEqual({ flatCents: 0, percentBps: 100 });
    expect(feeFor(emptyFeeSchedule(), 'BUY', 'SECURITY')).toEqual({ flatCents: 0, percentBps: 0 });
  });
});
