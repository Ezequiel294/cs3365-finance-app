import { describe, expect, it } from 'vitest';
import { FeeCalculator, feeFor } from './fee-calculator';
import type { Broker } from './types';

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
  it('fee: 1.55% of $300.00 is $4.65', () => {
    expect(FeeCalculator.fee({ flatCents: 0, percentBps: 155 }, 30000)).toBe(465);
  });

  it('fee rounds half to even and adds the flat part', () => {
    // 1% of 250 = 2.5 → 2 (even); 1% of 350 = 3.5 → 4
    expect(FeeCalculator.fee({ flatCents: 0, percentBps: 100 }, 250)).toBe(2);
    expect(FeeCalculator.fee({ flatCents: 0, percentBps: 100 }, 350)).toBe(4);
    expect(FeeCalculator.fee({ flatCents: 15, percentBps: 100 }, 20000)).toBe(215);
  });

  it('grossUp: an arrival of $295.35 at 1.55% means $300.00 was sent', () => {
    const fee = { flatCents: 0, percentBps: 155 };
    const sent = FeeCalculator.grossUp(fee, 29535);
    expect(sent).toBe(30000);
    expect(sent - 29535).toBe(FeeCalculator.fee(fee, sent));
  });

  it('suggest explains the rule', () => {
    expect(FeeCalculator.suggest(hapi, 'DEPOSIT', null, 30000)).toEqual({
      commissionCents: 465,
      netCents: 29535,
      explanation: 'Hapi deposit fee: 1.55% of $300.00 = $4.65',
    });
    expect(FeeCalculator.suggest(hapi, 'BUY', 'CRYPTO', 20000).explanation).toBe(
      'Hapi buy fee, crypto: 1% of $200.00 = $2.00',
    );
    expect(FeeCalculator.suggest(hapi, 'BUY', 'SECURITY', 10122)).toEqual({
      commissionCents: 15,
      netCents: 10137,
      explanation: 'Hapi buy fee, stocks and ETFs: $0.15 flat',
    });
  });

  it('feeFor picks the operation and asset class', () => {
    expect(feeFor(hapi, 'SELL', 'CRYPTO')).toEqual({ flatCents: 0, percentBps: 100 });
    expect(feeFor(hapi, 'WITHDRAWAL')).toEqual({ flatCents: 2500, percentBps: 0 });
  });
});
