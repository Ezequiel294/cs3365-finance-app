import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Broker, Holding, Price } from '../../../shared/types';
import { FixedClock } from '../../src/clock';
import { ConflictError, NotFoundError } from '../../src/http/errors';
import { HoldingCalculator } from '../../src/investments/holding-calculator';
import { InvestmentService } from '../../src/investments/investment-service';
import { PriceClient, isFresh } from '../../src/investments/price-client';
import {
  FallbackPriceProvider,
  PriceError,
  TwelveDataPriceProvider,
  YahooChartPriceProvider,
} from '../../src/investments/price-providers';
import { ValuationService, holdingValueCents } from '../../src/investments/valuation-service';
import { AggregateRepository } from '../../src/repositories/aggregate-repository';
import { DynamoStore } from '../../src/repositories/dynamo-store';
import { InvestmentTxRepository } from '../../src/repositories/investment-tx-repository';
import { ReferenceRepository } from '../../src/repositories/reference-repository';
import { USER, jsonResponse } from '../helpers';

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
const clock = new FixedClock(new Date('2026-11-11T21:00:00Z'));

const yahooBody = (price: number, currency = 'USD', type = 'ETF', name = 'Vanguard Total World Stock ETF') => ({
  chart: {
    result: [{ meta: { regularMarketPrice: price, regularMarketTime: 1794430800, currency, instrumentType: type, longName: name } }],
    error: null,
  },
});

describe('HoldingCalculator', () => {
  const calc = new HoldingCalculator();
  const buy = { id: 'b', type: 'BUY' as const, brokerId: 'brk-hapi', ticker: 'VT', assetClass: 'SECURITY' as const, quantityMicro: 2_000_000, grossCents: 20000, commissionCents: 15, name: 'VT', localDate: '2026-10-01', createdAt: 'a', amountCents: 0 };

  it('a buy adds units and cost including the fee', () => {
    expect(calc.applyBuy(null, buy)).toMatchObject({ quantityMicro: 2_000_000, costBasisCents: 20015, version: 1 });
  });
  it('a sell removes average cost and records the realized gain', () => {
    const h = calc.applyBuy(null, buy);
    const r = calc.applySell(h, { ...buy, id: 's', type: 'SELL', quantityMicro: 500_000, grossCents: 6000, commissionCents: 15 });
    expect(r.costRemovedCents).toBe(5004); // 20015 × 0.25 = 5003.75 → 5004
    expect(r.realizedGainCents).toBe(6000 - 15 - 5004);
    expect(r.holding.quantityMicro).toBe(1_500_000);
  });
  it('selling more than held is a conflict', () => {
    expect(() => calc.applySell(calc.applyBuy(null, buy), { ...buy, type: 'SELL', quantityMicro: 3_000_000 })).toThrow(ConflictError);
  });
  it('cash moves per type', () => {
    expect(calc.cashDelta({ type: 'DEPOSIT', amountCents: 30000, grossCents: 0, commissionCents: 465 })).toBe(29535);
    expect(calc.cashDelta({ type: 'BUY', amountCents: 0, grossCents: 20000, commissionCents: 200 })).toBe(-20200);
    expect(calc.cashDelta({ type: 'WITHDRAWAL', amountCents: 10000, grossCents: 0, commissionCents: 2500 })).toBe(-10000);
  });
  it('replay rebuilds from trades in date order', () => {
    const r = calc.replay([
      { ...buy, id: 's', type: 'SELL', quantityMicro: 1_000_000, grossCents: 11000, localDate: '2026-10-05' },
      buy,
    ]);
    expect(r.holding).toMatchObject({ quantityMicro: 1_000_000 });
    expect(r.realizedById.get('s')).toBe(11000 - 15 - 10008);
  });
});

describe('holding value with BigInt', () => {
  it('half a bitcoin at $100,000 is exact', () => {
    // 0.5 × 100000.123456 = 50000.061728 → 5000006.1728 cents → 5000006
    expect(holdingValueCents(500_000, 100_000_123_456)).toBe(5_000_006);
    expect(holdingValueCents(653_300, 154_940_000)).toBe(10122);
  });
});

describe('YahooChartPriceProvider', () => {
  it('sends a browser User-Agent and reads the meta block', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, yahooBody(154.94)));
    const q = await new YahooChartPriceProvider(fetchFn as never).quote('VT');
    expect(q).toMatchObject({ symbol: 'VT', price: '154.94', currency: 'USD', instrumentType: 'ETF', name: 'Vanguard Total World Stock ETF' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://query1.finance.yahoo.com/v8/finance/chart/VT?range=1d&interval=1d');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('Mozilla/5.0');
  });
  it('404 is NOT_FOUND, 429 is UNAVAILABLE', async () => {
    const nf = new YahooChartPriceProvider((async () => jsonResponse(404, { chart: { result: null, error: { code: 'Not Found' } } })) as never);
    await expect(nf.quote('VTX')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const busy = new YahooChartPriceProvider((async () => jsonResponse(429, {})) as never);
    await expect(busy.quote('VT')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});

describe('FallbackPriceProvider and Twelve Data', () => {
  it('tries Twelve Data when Yahoo is unavailable and the symbol is supported', async () => {
    const yahoo = { quote: async () => { throw new PriceError('UNAVAILABLE', 'yahoo', 429); } };
    const td = new TwelveDataPriceProvider('k', (async () => jsonResponse(200, { price: '348.63000' })) as never, () => clock.now());
    const p = new FallbackPriceProvider([yahoo], async () => [td]);
    expect(await p.quote('VOO')).toMatchObject({ price: '348.63000', provider: 'twelvedata', time: clock.now().toISOString() });
  });
  it('a body with status error is a failure; NOT_FOUND only when every provider said so', async () => {
    const yahoo = { quote: async () => { throw new PriceError('NOT_FOUND', 'yahoo', 404); } };
    const td = new TwelveDataPriceProvider('k', (async () => jsonResponse(200, { code: 401, message: 'bad key', status: 'error' })) as never);
    await expect(new FallbackPriceProvider([yahoo], async () => [td]).quote('VTX')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(new FallbackPriceProvider([yahoo]).quote('VTX')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('Twelve Data supports US symbols and crypto, not other exchanges', () => {
    const td = new TwelveDataPriceProvider('k');
    expect(td.supports('VT')).toBe(true);
    expect(td.supports('BTC-USD')).toBe(true);
    expect(td.supports('VWRA.L')).toBe(false);
  });
});

function priceCache(initial: Price[] = []) {
  const store = new Map(initial.map((p) => [p.ticker, p]));
  return {
    store,
    getPrices: async (t: string[]) => t.map((x) => store.get(x)).filter((x): x is Price => !!x),
    putPrice: async (p: Price) => void store.set(p.ticker, p),
    recordPriceError: async (ticker: string, code: any, at: string) =>
      void store.set(ticker, { ...(store.get(ticker) ?? ({ ticker } as Price)), lastError: code, lastAttemptAt: at }),
  };
}

describe('PriceClient (07-S02)', () => {
  it('converts a CAD quote with the USDCAD=X pair and caches both', async () => {
    const cache = priceCache();
    const provider = {
      quote: async (s: string) =>
        s === 'USDCAD=X'
          ? { symbol: s, name: null, instrumentType: 'CURRENCY', currency: 'CAD', price: '1.4', time: '2026-11-11T21:00:00Z', provider: 'yahoo' }
          : { symbol: s, name: 'Shopify', instrumentType: 'EQUITY', currency: 'CAD', price: '208.12', time: '2026-11-11T21:00:00Z', provider: 'yahoo' },
    };
    const [p] = await new PriceClient(cache, provider, clock).prices(['SHOP.TO']);
    expect(p).toMatchObject({ ticker: 'SHOP.TO', priceMicros: 148_657_143, nativeCurrency: 'CAD', fxRate: '1.4' });
    expect(cache.store.has('USDCAD=X')).toBe(true);
    expect(p!.ttl).toBe(Math.floor(clock.now().getTime() / 1000) + 30 * 86400);
  });

  it('GBp quotes are divided by 100 first', async () => {
    const provider = {
      quote: async (s: string) =>
        s === 'USDGBP=X'
          ? { symbol: s, name: null, instrumentType: 'CURRENCY', currency: 'GBP', price: '0.8', time: 't', provider: 'yahoo' }
          : { symbol: s, name: 'X', instrumentType: 'ETF', currency: 'GBp', price: '12000', time: 't', provider: 'yahoo' },
    };
    const [p] = await new PriceClient(priceCache(), provider, clock).prices(['VWRA.L']);
    expect(p!.priceMicros).toBe(150_000_000);
  });

  it('a fresh price is used as is; a failed refresh keeps the last price and records the error', async () => {
    const fresh: Price = { ticker: 'VT', priceMicros: 154_940_000, nativePrice: '154.94', nativeCurrency: 'USD', fxRate: null, instrumentType: 'ETF', name: 'VT', provider: 'yahoo', marketTime: '2026-11-11T20:00:00Z', retrievedAt: '2026-11-11T20:55:00Z', lastAttemptAt: null, lastError: null, ttl: 1 };
    const stale: Price = { ...fresh, ticker: 'BTC-USD', retrievedAt: '2026-11-11T18:00:00Z' };
    const quote = vi.fn(async () => { throw new PriceError('UNAVAILABLE', 'yahoo', 500); });
    const cache = priceCache([fresh, stale]);
    const prices = await new PriceClient(cache, { quote }, clock).prices(['VT', 'BTC-USD']);
    expect(quote).toHaveBeenCalledTimes(1);
    expect(prices[0]).toBe(fresh);
    expect(prices[1]).toMatchObject({ priceMicros: 154_940_000, lastError: 'UNAVAILABLE' });
    expect(isFresh(prices[1], clock.now())).toBe(false);
  });

  it('a NOT_FOUND ticker is asked again at most once an hour, and quote() is a 404', async () => {
    const quote = vi.fn(async () => { throw new PriceError('NOT_FOUND', 'yahoo', 404); });
    const client = new PriceClient(priceCache(), { quote }, clock);
    await expect(client.quote('VTX')).rejects.toBeInstanceOf(NotFoundError);
    await client.prices(['VTX']);
    expect(quote).toHaveBeenCalledTimes(1);
  });
});

describe('ValuationService (07-S02, 07-S05)', () => {
  const holdings: Holding[] = [
    { brokerId: 'brk-hapi', ticker: 'VT', assetClass: 'SECURITY', name: 'VT', quantityMicro: 653_300, costBasisCents: 10137, realizedGainCents: 0, version: 1 },
    { brokerId: 'brk-hapi', ticker: 'BTC-USD', assetClass: 'CRYPTO', name: 'Bitcoin', quantityMicro: 2_712, costBasisCents: 20200, realizedGainCents: 0, version: 1 },
    { brokerId: 'brk-hapi', ticker: 'VTX', assetClass: 'SECURITY', name: null, quantityMicro: 1_000_000, costBasisCents: 500, realizedGainCents: 0, version: 1 },
  ];
  const price = (ticker: string, micros: number | null, marketTime: string): Price => ({ ticker, priceMicros: micros, nativePrice: null, nativeCurrency: 'USD', fxRate: null, instrumentType: null, name: null, provider: 'yahoo', marketTime, retrievedAt: '2026-11-11T20:59:00Z', lastAttemptAt: null, lastError: micros ? null : 'NOT_FOUND', ttl: null });
  const svc = (cash = 9335) =>
    new ValuationService(
      { getHoldings: async () => holdings, getCash: async () => [{ brokerId: 'brk-hapi', balanceCents: cash }] },
      { listBrokers: async () => [hapi] },
      {
        prices: async () => [price('VT', 154_940_000, '2026-11-11T21:00:00Z'), price('BTC-USD', 75_000_000_000, '2026-11-11T20:30:00Z'), price('VTX', null, '')],
        quote: async () => { throw new Error('unused'); },
      },
      clock,
    );

  it('values priced holdings, leaves unpriced ones out of the totals, and reports the oldest price time', async () => {
    const v = await svc().value(USER);
    expect(v.unpriced).toEqual(['VTX']);
    const vt = v.holdings.find((h) => h.holding.ticker === 'VT')!;
    const btc = v.holdings.find((h) => h.holding.ticker === 'BTC-USD')!;
    expect(vt).toMatchObject({ marketValueCents: 10122, unrealizedGainCents: -15 });
    expect(btc.marketValueCents).toBe(20340);
    expect(v.totalValueCents).toBe(30462);
    expect(v.totalCostBasisCents).toBe(30337);
    expect(v.unrealizedGainCents).toBe(125);
    expect(v.priceTime).toBe('2026-11-11T20:30:00Z');
    expect(vt.shareBps! + btc.shareBps!).toBe(10000);
  });

  it('the selling estimate splits gross into to-bank, selling fees, and the withdrawal fee', async () => {
    const l = await svc().liquidation(USER);
    const b = l.brokers[0]!;
    expect(b.holdings.find((h) => h.ticker === 'BTC-USD')).toMatchObject({ sellFeeCents: 203, netCents: 20137 });
    expect(b.sellFeesCents).toBe(15 + 203);
    expect(b.cashCents).toBe(9335);
    expect(b.withdrawalFeeCents).toBe(2500);
    expect(b.grossCents).toBe(b.netToBankCents + b.sellFeesCents + b.withdrawalFeeCents);
    expect(l.totalCents).toBe(b.netToBankCents);
    expect(b.withdrawalFeeExplained).toBe('Hapi withdrawal fee: $25.00 flat');
  });

  it('negative cash is flagged, not rejected', async () => {
    expect((await svc(-5230).liquidation(USER)).brokers[0]!.negativeCash).toBe(true);
  });
});

describe('InvestmentService.record (07-S01, 07-S04)', () => {
  const ddb = mockClient(DynamoDBDocumentClient);
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }));
  const store = new DynamoStore(doc);
  const svc = () =>
    new InvestmentService(
      new ReferenceRepository(store, 'Reference'),
      new InvestmentTxRepository(store, 'InvestmentTx'),
      new AggregateRepository(store, 'Aggregates'),
      new HoldingCalculator(),
      store,
      clock,
    );
  beforeEach(() => {
    ddb.reset();
    ddb.on(GetCommand, { TableName: 'Reference' }).resolves({ Item: { PK: 'x', SK: 'BROKER#brk-hapi', ...hapi } });
    ddb.on(GetCommand, { TableName: 'Aggregates' }).resolves({});
    ddb.on(QueryCommand).resolves({ Items: [{ PK: 'x', SK: 'CASH#brk-hapi', balanceCents: 29535 }] });
    ddb.on(TransactWriteCommand).resolves({});
  });

  it('a deposit without a commission derives 1.55% from the schedule', async () => {
    const r = await svc().record(USER, { type: 'DEPOSIT', brokerId: 'brk-hapi', localDate: '2026-11-11', amountCents: 30000 });
    expect(r.transaction).toMatchObject({ commissionCents: 465, commissionSource: 'rule', amountCents: 30000 });
    const items = ddb.commandCalls(TransactWriteCommand)[0]!.args[0].input.TransactItems!;
    expect(items.map((i) => (i.Put ?? i.Update)!.TableName)).toEqual(['InvestmentTx', 'Aggregates', 'Aggregates']);
    expect(items[1]!.Update!.ExpressionAttributeValues).toEqual({ ':b': 29535 });
    expect(items[2]!.Update!.Key!.SK).toBe('MONTH#2026-11#INV');
  });

  it('a buy adds to the holding with a version condition; a typed fee is manual', async () => {
    const r = await svc().record(USER, {
      type: 'BUY', brokerId: 'brk-hapi', localDate: '2026-11-11', ticker: 'BTC-USD', assetClass: 'CRYPTO', quantityMicro: 2712, grossCents: 20000, commissionCents: 250,
    });
    expect(r.transaction.commissionSource).toBe('manual');
    expect(r.holding).toMatchObject({ quantityMicro: 2712, costBasisCents: 20250 });
    const items = ddb.commandCalls(TransactWriteCommand)[0]!.args[0].input.TransactItems!;
    expect(items[1]!.Put!.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(items[0]!.Put!.Item!.tickerPK).toBe(`USER#${USER}#BTC-USD`);
  });
});
