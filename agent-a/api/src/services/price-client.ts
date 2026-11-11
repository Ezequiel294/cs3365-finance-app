import { divRoundHalfEven, formatScaled, normalizeTicker, parseDecimal, type Price, type Quote } from '@finance/shared';
import type { Clock } from '../clock';
import { NotFoundError, PriceUnavailableError } from '../errors';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import { PriceError, type MarketPriceProvider } from './price-providers';

export const FRESH_MS = 15 * 60 * 1000;
export const NOT_FOUND_RETRY_MS = 60 * 60 * 1000;
export const UNAVAILABLE_RETRY_MS = 60 * 1000;
export const PRICE_TTL_SECONDS = 30 * 86400;
const MAX_PARALLEL = 4;

/** Quotes in minor units: divide by 100 first. */
const MINOR_UNIT_CURRENCIES: Record<string, string> = { GBp: 'GBP', GBX: 'GBP', ZAc: 'ZAR', ILA: 'ILS' };

/** `Price.isFresh(now)`: `retrievedAt` under 15 minutes old. */
export function isFresh(price: Price | undefined | null, now: Date): boolean {
  if (!price?.retrievedAt || price.priceMicros === null || price.priceMicros === undefined) return false;
  return now.getTime() - new Date(price.retrievedAt).getTime() < FRESH_MS;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Shared `PRICE#<ticker>` cache in front of the market price providers. */
export class PriceClient {
  constructor(
    private readonly aggregates: AggregateRepository,
    private readonly provider: MarketPriceProvider,
    private readonly clock: Clock,
  ) {}

  /** Batch-reads cached prices, refreshes stale ones (at most 4 at a time), and returns one entry per ticker. */
  async prices(tickers: string[]): Promise<Price[]> {
    const unique = [...new Set(tickers)];
    const now = this.clock.now();
    const cached = new Map((await this.aggregates.getPrices(unique)).map((p) => [p.ticker, p]));
    return mapLimit(unique, MAX_PARALLEL, async (ticker) => {
      const existing = cached.get(ticker);
      if (isFresh(existing, now) || this.recentlyFailed(existing, now)) return existing ?? { ticker };
      return this.refresh(ticker, existing);
    });
  }

  /** The Buy form's lookup: the instrument with its USD price. */
  async quote(rawTicker: string): Promise<Quote> {
    const ticker = normalizeTicker(rawTicker);
    const now = this.clock.now();
    const [existing] = await this.aggregates.getPrices([ticker]);
    let price: Price;
    if (isFresh(existing, now)) {
      price = existing;
    } else {
      try {
        price = await this.fetchAndStore(ticker);
      } catch (err) {
        const code = err instanceof PriceError ? err.code : 'UNAVAILABLE';
        await this.recordFailure(ticker, code);
        if (code === 'NOT_FOUND') throw new NotFoundError(`No instrument ${ticker} on Yahoo Finance`);
        if (code === 'UNSUPPORTED_CURRENCY') throw new PriceUnavailableError(`Prices in ${existing?.nativeCurrency ?? 'that currency'} are not supported`);
        throw new PriceUnavailableError('The price service is unavailable; try again shortly');
      }
    }
    const instrumentType = price.instrumentType ?? 'EQUITY';
    return {
      symbol: ticker,
      name: price.name ?? ticker,
      instrumentType,
      assetClass: instrumentType === 'CRYPTOCURRENCY' ? 'CRYPTO' : 'SECURITY',
      currency: 'USD',
      price: formatScaled(BigInt(price.priceMicros!), 6),
      priceMicros: price.priceMicros!,
      time: price.marketTime ?? price.retrievedAt!,
    };
  }

  private recentlyFailed(price: Price | undefined, now: Date): boolean {
    if (!price?.lastError || !price.lastAttemptAt) return false;
    const age = now.getTime() - new Date(price.lastAttemptAt).getTime();
    if (price.lastError === 'NOT_FOUND') return age < NOT_FOUND_RETRY_MS;
    return age < UNAVAILABLE_RETRY_MS;
  }

  /** On failure, only `lastError` and `lastAttemptAt` change; the last known price stays. */
  private async refresh(ticker: string, existing?: Price): Promise<Price> {
    try {
      return await this.fetchAndStore(ticker);
    } catch (err) {
      const code = err instanceof PriceError ? err.code : 'UNAVAILABLE';
      const at = await this.recordFailure(ticker, code);
      return { ...(existing ?? { ticker }), lastError: code, lastAttemptAt: at };
    }
  }

  private async recordFailure(ticker: string, code: string): Promise<string> {
    const now = this.clock.now();
    const at = now.toISOString();
    await this.aggregates
      .putPriceError(ticker, code, at, Math.floor(now.getTime() / 1000) + PRICE_TTL_SECONDS)
      .catch(() => undefined);
    return at;
  }

  private async fetchAndStore(ticker: string): Promise<Price> {
    const quote = await this.provider.quote(ticker);
    const usd = await this.toUsd(quote);
    const now = this.clock.now();
    const price: Price = {
      ticker,
      priceMicros: usd.priceMicros,
      nativePrice: quote.price,
      nativeCurrency: quote.currency,
      fxRate: usd.fxRate,
      instrumentType: quote.instrumentType,
      name: quote.name,
      provider: this.provider.name,
      marketTime: quote.time,
      retrievedAt: now.toISOString(),
      lastAttemptAt: now.toISOString(),
      lastError: null,
      ttl: Math.floor(now.getTime() / 1000) + PRICE_TTL_SECONDS,
    };
    await this.aggregates.putPrice(price);
    return price;
  }

  /** USD as is; otherwise divide by Yahoo's `USD{CUR}=X` rate (minor-unit quotes ÷ 100 first). */
  private async toUsd(quote: Quote): Promise<{ priceMicros: number; fxRate: string | null }> {
    if (quote.currency === 'USD') return { priceMicros: Number(parseDecimal(quote.price, 6)), fxRate: null };
    const major = MINOR_UNIT_CURRENCIES[quote.currency] ?? quote.currency.toUpperCase();
    const divisor = MINOR_UNIT_CURRENCIES[quote.currency] ? 100n : 1n;
    let rate: string;
    try {
      rate = await this.pairRate(`USD${major}=X`);
    } catch {
      throw new PriceError('UNSUPPORTED_CURRENCY', this.provider.name);
    }
    const scale = 10;
    const native = parseDecimal(quote.price, scale);
    const rateScaled = parseDecimal(rate, scale);
    if (rateScaled <= 0n) throw new PriceError('UNSUPPORTED_CURRENCY', this.provider.name);
    const micros = divRoundHalfEven(native * 1_000_000n, rateScaled * divisor);
    return { priceMicros: Number(micros), fxRate: rate };
  }

  /** The FX pair's quote, cached as its own `PRICE#` item. */
  private async pairRate(pair: string): Promise<string> {
    const now = this.clock.now();
    const [cached] = await this.aggregates.getPrices([pair]);
    if (isFresh(cached, now) && cached.nativePrice) return cached.nativePrice;
    const quote = await this.provider.quote(pair);
    await this.aggregates.putPrice({
      ticker: pair,
      priceMicros: Number(parseDecimal(quote.price, 6)),
      nativePrice: quote.price,
      nativeCurrency: quote.currency,
      instrumentType: quote.instrumentType,
      name: quote.name,
      provider: this.provider.name,
      marketTime: quote.time,
      retrievedAt: now.toISOString(),
      lastAttemptAt: now.toISOString(),
      lastError: null,
      ttl: Math.floor(now.getTime() / 1000) + PRICE_TTL_SECONDS,
    });
    return quote.price;
  }
}
