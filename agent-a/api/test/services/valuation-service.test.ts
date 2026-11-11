import type { Price } from '@finance/shared';
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/clock';
import { ValuationService } from '../../src/services/valuation-service';

const NOW = new Date('2026-11-10T15:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60000).toISOString();

const hapi = {
  id: 'brk-hapi', name: 'Hapi', version: 1,
  fees: {
    deposit: { flatCents: 0, percentBps: 155 },
    withdrawal: { flatCents: 2500, percentBps: 0 },
    buy: { security: { flatCents: 15, percentBps: 0 }, crypto: { flatCents: 0, percentBps: 100 } },
    sell: { security: { flatCents: 15, percentBps: 0 }, crypto: { flatCents: 0, percentBps: 100 } },
  },
};

function build(prices: Price[], cash = 1000) {
  const aggregates = {
    getHoldings: async () => [
      { brokerId: 'brk-hapi', ticker: 'VT', assetClass: 'SECURITY', quantityMicro: 653300, costBasisCents: 10137, realizedGainCents: 0, version: 1 },
      { brokerId: 'brk-hapi', ticker: 'BTC-USD', assetClass: 'CRYPTO', quantityMicro: 500000, costBasisCents: 4000000, realizedGainCents: 0, version: 1 },
      { brokerId: 'brk-hapi', ticker: 'VTX', assetClass: 'SECURITY', quantityMicro: 1000000, costBasisCents: 100, realizedGainCents: 0, version: 1 },
      { brokerId: 'brk-hapi', ticker: 'OLD', assetClass: 'SECURITY', quantityMicro: 0, costBasisCents: 0, realizedGainCents: 5, version: 3 },
    ],
    getCash: async () => [{ brokerId: 'brk-hapi', balanceCents: cash }],
  };
  const reference = { listBrokers: async () => [hapi] };
  const priceClient = { prices: async (t: string[]) => prices.filter((p) => t.includes(p.ticker)) };
  return new ValuationService(aggregates as never, reference as never, priceClient as never, new FixedClock(NOW));
}

const prices: Price[] = [
  { ticker: 'VT', priceMicros: 154940000, retrievedAt: minutesAgo(5) },
  { ticker: 'BTC-USD', priceMicros: 97123450000, retrievedAt: minutesAgo(180) },
  { ticker: 'VTX', lastError: 'NOT_FOUND', lastAttemptAt: minutesAgo(1) },
];

describe('ValuationService', () => {
  it('values priced holdings with BigInt, marks stale prices, and lists unpriced tickers (07-S02)', async () => {
    const v = await build(prices).value('u');
    expect(v.holdings.map((h) => h.holding.ticker)).toEqual(['BTC-USD', 'VT', 'VTX']);
    const vt = v.holdings.find((h) => h.holding.ticker === 'VT')!;
    const btc = v.holdings.find((h) => h.holding.ticker === 'BTC-USD')!;
    expect(vt).toMatchObject({ marketValueCents: 10122, stale: false });
    expect(btc).toMatchObject({ marketValueCents: 4856172, stale: true });
    expect(v.unpriced).toEqual(['VTX']);
    expect(v.totalValueCents).toBe(10122 + 4856172);
  });

  it('estimates what selling everything would bring home (07-S05)', async () => {
    const l = await build(prices).liquidation('u');
    const [hapiExit] = l.brokers;
    const vt = hapiExit.holdings.find((h) => h.ticker === 'VT')!;
    const btc = hapiExit.holdings.find((h) => h.ticker === 'BTC-USD')!;
    expect(vt).toMatchObject({ sellFeeCents: 15, netCents: 10107, unrealizedGainCents: 10107 - 10137, sellFeeExplained: 'Hapi sell fee, stocks and ETFs: $0.15 flat' });
    expect(btc).toMatchObject({ sellFeeCents: 48562, netCents: 4856172 - 48562 });
    expect(hapiExit.proceedsCents).toBe(10107 + 4807610 + 1000);
    expect(hapiExit.withdrawalFeeCents).toBe(2500);
    expect(hapiExit.netToBankCents).toBe(hapiExit.proceedsCents - 2500);
    expect(hapiExit.negativeCash).toBe(false);
    expect(l.totalCents).toBe(hapiExit.netToBankCents);
    expect(l.unpriced).toEqual(['VTX']);
    expect(l.priceTime).toBe(minutesAgo(180));
  });

  it('flags negative cash and skips the withdrawal fee when nothing would be withdrawn', async () => {
    const l = await build([], -5230).liquidation('u');
    expect(l.brokers[0]).toMatchObject({ cashCents: -5230, proceedsCents: -5230, withdrawalFeeCents: 0, negativeCash: true });
  });
});
