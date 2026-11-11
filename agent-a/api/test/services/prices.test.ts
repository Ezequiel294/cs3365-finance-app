import type { Price } from '@finance/shared';
import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '../../src/clock';
import { NotFoundError, PriceUnavailableError } from '../../src/errors';
import { PriceClient } from '../../src/services/price-client';
import { FallbackPriceProvider, PriceError, TwelveDataPriceProvider, YahooChartPriceProvider } from '../../src/services/price-providers';

const NOW = new Date('2026-11-10T15:00:00Z');
const clock = new FixedClock(NOW);

const chart = (meta: Record<string, unknown>) => new Response(JSON.stringify({ chart: { result: [{ meta }], error: null } }), { status: 200 });

function yahoo(responses: Record<string, Response | (() => Response)>) {
  const fetchFn = vi.fn(async (url: string, _init?: RequestInit) => {
    const symbol = decodeURIComponent(url.split('/chart/')[1].split('?')[0]);
    const r = responses[symbol];
    if (!r) return new Response(JSON.stringify({ chart: { result: null, error: { code: 'Not Found' } } }), { status: 404 });
    return typeof r === 'function' ? r() : r.clone();
  });
  return { provider: new YahooChartPriceProvider(fetchFn as never), fetchFn };
}

function fakeAgg(initial: Price[] = []) {
  const prices = new Map(initial.map((p) => [p.ticker, p]));
  return {
    prices,
    getPrices: async (t: string[]) => t.flatMap((x) => (prices.has(x) ? [prices.get(x)!] : [])),
    putPrice: async (p: Price) => void prices.set(p.ticker, p),
    putPriceError: async (ticker: string, code: string, at: string) =>
      void prices.set(ticker, { ...(prices.get(ticker) ?? { ticker }), lastError: code as never, lastAttemptAt: at }),
  };
}

describe('YahooChartPriceProvider', () => {
  it('reads chart.result[0].meta with a browser User-Agent', async () => {
    const { provider, fetchFn } = yahoo({
      VT: chart({ regularMarketPrice: 154.94, regularMarketTime: 1794337200, currency: 'USD', instrumentType: 'ETF', longName: 'Vanguard Total World Stock ETF' }),
    });
    const q = await provider.quote('VT');
    expect(q).toMatchObject({ symbol: 'VT', name: 'Vanguard Total World Stock ETF', instrumentType: 'ETF', assetClass: 'SECURITY', currency: 'USD', price: '154.94' });
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('Mozilla/5.0');
    expect(fetchFn.mock.calls[0][0]).toBe('https://query1.finance.yahoo.com/v8/finance/chart/VT?range=1d&interval=1d');
  });

  it('maps 404 to NOT_FOUND and 429 or a missing price to UNAVAILABLE', async () => {
    const { provider } = yahoo({ BAD: new Response('', { status: 429 }), EMPTY: chart({ currency: 'USD' }) });
    await expect(provider.quote('VTX')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(provider.quote('BAD')).rejects.toMatchObject({ code: 'UNAVAILABLE', httpStatus: 429 });
    await expect(provider.quote('EMPTY')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});

describe('TwelveDataPriceProvider and FallbackPriceProvider', () => {
  it('treats status error bodies as failures and supports US symbols and crypto only', async () => {
    const td = new TwelveDataPriceProvider('k', (async () => new Response(JSON.stringify({ code: 401, message: 'bad key', status: 'error' }), { status: 200 })) as never);
    expect(td.supports('VT')).toBe(true);
    expect(td.supports('BTC-USD')).toBe(true);
    expect(td.supports('VWRA.L')).toBe(false);
    await expect(td.quote('VT')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('asks the fallback only after Yahoo fails, and NOT_FOUND only when all say so', async () => {
    const { provider: y } = yahoo({ VT: new Response('', { status: 503 }) });
    const tdFetch = vi.fn(async () => new Response(JSON.stringify({ price: '154.90000' }), { status: 200 }));
    const fb = new FallbackPriceProvider([y], async () => [new TwelveDataPriceProvider('k', tdFetch as never)]);
    expect((await fb.quote('VT')).price).toBe('154.90000');
    expect(String((tdFetch.mock.calls[0] as unknown as [string])[0])).toContain('symbol=VT');
    const onlyYahoo = new FallbackPriceProvider([y]);
    await expect(onlyYahoo.quote('VTX')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(onlyYahoo.quote('VT')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});

describe('PriceClient', () => {
  it('converts a CAD quote with Yahoo FX pair, caching both as PRICE# items', async () => {
    const { provider } = yahoo({
      'SHOP.TO': chart({ regularMarketPrice: 208.12, regularMarketTime: 1794337200, currency: 'CAD', instrumentType: 'EQUITY', longName: 'Shopify Inc.' }),
      'USDCAD=X': chart({ regularMarketPrice: 1.4, regularMarketTime: 1794337200, currency: 'CAD', instrumentType: 'CURRENCY', shortName: 'USD/CAD' }),
    });
    const agg = fakeAgg();
    const pc = new PriceClient(agg as never, provider, clock);
    const [price] = await pc.prices(['SHOP.TO']);
    expect(price).toMatchObject({ ticker: 'SHOP.TO', priceMicros: 148657143, nativePrice: '208.12', nativeCurrency: 'CAD', fxRate: '1.4', lastError: null });
    expect(agg.prices.has('USDCAD=X')).toBe(true);
    expect(price.ttl).toBe(Math.floor(NOW.getTime() / 1000) + 30 * 86400);
  });

  it('divides minor-unit quotes by 100 first (GBp)', async () => {
    const { provider } = yahoo({
      'VWRA.L': chart({ regularMarketPrice: 10000, currency: 'GBp', instrumentType: 'ETF' }),
      'USDGBP=X': chart({ regularMarketPrice: 0.8, currency: 'GBP', instrumentType: 'CURRENCY' }),
    });
    const [price] = await new PriceClient(fakeAgg() as never, provider, clock).prices(['VWRA.L']);
    expect(price.priceMicros).toBe(125_000_000);
  });

  it('fails a quote whose FX pair cannot be fetched with UNSUPPORTED_CURRENCY', async () => {
    const { provider } = yahoo({ '005930.KS': chart({ regularMarketPrice: 70000, currency: 'KRW', instrumentType: 'EQUITY' }) });
    const [price] = await new PriceClient(fakeAgg() as never, provider, clock).prices(['005930.KS']);
    expect(price.lastError).toBe('UNSUPPORTED_CURRENCY');
    expect(price.priceMicros).toBeUndefined();
  });

  it('uses a fresh price, refreshes a stale one, and keeps the last price when a refresh fails', async () => {
    const fresh = { ticker: 'VT', priceMicros: 154940000, retrievedAt: new Date(NOW.getTime() - 5 * 60000).toISOString() };
    const stale = { ticker: 'BTC-USD', priceMicros: 97000000000, retrievedAt: new Date(NOW.getTime() - 3 * 3600000).toISOString() };
    const { provider, fetchFn } = yahoo({ 'BTC-USD': new Response('', { status: 500 }) });
    const pc = new PriceClient(fakeAgg([fresh, stale]) as never, provider, clock);
    const result = await pc.prices(['VT', 'BTC-USD']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result[0]).toEqual(fresh);
    expect(result[1]).toMatchObject({ priceMicros: 97000000000, lastError: 'UNAVAILABLE', retrievedAt: stale.retrievedAt });
  });

  it('asks a NOT_FOUND ticker again at most once an hour', async () => {
    const { provider, fetchFn } = yahoo({});
    const agg = fakeAgg([{ ticker: 'VTX', lastError: 'NOT_FOUND', lastAttemptAt: new Date(NOW.getTime() - 10 * 60000).toISOString() }]);
    await new PriceClient(agg as never, provider, clock).prices(['VTX']);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('maps quote errors to 404 and 503', async () => {
    const { provider } = yahoo({ DOWN: new Response('', { status: 502 }) });
    const pc = new PriceClient(fakeAgg() as never, provider, clock);
    await expect(pc.quote('vtx')).rejects.toThrow(new NotFoundError('No instrument VTX on Yahoo Finance'));
    await expect(pc.quote('DOWN')).rejects.toBeInstanceOf(PriceUnavailableError);
  });

  it('returns the Buy form quote with asset class and USD price', async () => {
    const { provider } = yahoo({ 'BTC-USD': chart({ regularMarketPrice: 73746.2, currency: 'USD', instrumentType: 'CRYPTOCURRENCY', shortName: 'Bitcoin USD' }) });
    const q = await new PriceClient(fakeAgg() as never, provider, clock).quote('btc/usd');
    expect(q).toMatchObject({ symbol: 'BTC-USD', name: 'Bitcoin USD', assetClass: 'CRYPTO', price: '73746.2', priceMicros: 73746200000 });
  });

  it('PriceError carries code and provider', () => {
    expect(new PriceError('NOT_FOUND', 'yahoo', 404)).toMatchObject({ code: 'NOT_FOUND', provider: 'yahoo', httpStatus: 404 });
  });
});
