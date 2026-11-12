import type { Quote } from '../../../shared/api-types';
import { decimalToScaled, divRoundHalfEven } from '../../../shared/money';
import type { Price, PriceErrorCode } from '../../../shared/types';
import type { Clock } from '../clock';
import { NotFoundError, PriceUnavailableError } from '../http/errors';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import { type MarketPriceProvider, PriceError, type ProviderQuote } from './price-providers';

export const FRESH_MS = 15 * 60 * 1000;
const NOT_FOUND_RETRY_MS = 60 * 60 * 1000;
const FAILURE_BACKOFF_MS = 60 * 1000;
const TTL_DAYS = 30;
const MAX_PARALLEL = 4;

/** Quotes in minor units: divide by 100 first. */
const MINOR_UNIT_CURRENCIES: Record<string, string> = { GBp: 'GBP', GBX: 'GBP', ZAc: 'ZAR', ILA: 'ILS' };

/** Price.isFresh(now): retrievedAt under 15 minutes old. */
export function isFresh(price: Pick<Price, 'retrievedAt'> | null | undefined, now: Date): boolean {
  if (!price?.retrievedAt) return false;
  return now.getTime() - new Date(price.retrievedAt).getTime() < FRESH_MS;
}

function emptyPrice(ticker: string): Price {
  return {
    ticker,
    priceMicros: null,
    nativePrice: null,
    nativeCurrency: null,
    fxRate: null,
    instrumentType: null,
    name: null,
    provider: null,
    marketTime: null,
    retrievedAt: null,
    lastAttemptAt: null,
    lastError: null,
    ttl: null,
  };
}

/** Shared PRICE#<ticker> cache in front of the market price providers. */
export class PriceClient {
  constructor(
    private readonly aggregates: Pick<AggregateRepository, 'getPrices' | 'putPrice' | 'recordPriceError'>,
    private readonly provider: MarketPriceProvider,
    private readonly clock: Clock,
  ) {}

  /** Cached prices, refreshing the ones that are not fresh (at most 4 at a time). */
  async prices(tickers: string[]): Promise<Price[]> {
    const unique = [...new Set(tickers)];
    const cached = new Map((await this.aggregates.getPrices(unique)).map((p) => [p.ticker, p]));
    const now = this.clock.now();
    const toRefresh = unique.filter((t) => this.needsRefresh(cached.get(t), now));
    const refreshed = new Map<string, Price>();
    for (let i = 0; i < toRefresh.length; i += MAX_PARALLEL) {
      const batch = toRefresh.slice(i, i + MAX_PARALLEL);
      const results = await Promise.all(batch.map((t) => this.refresh(t, cached.get(t) ?? null)));
      batch.forEach((t, j) => refreshed.set(t, results[j]!));
    }
    return unique.map((t) => refreshed.get(t) ?? cached.get(t) ?? emptyPrice(t));
  }

  /** The Buy form's lookup (GET /api/portfolio/quote). */
  async quote(ticker: string): Promise<Quote> {
    const [price] = await this.prices([ticker]);
    if (!price || price.priceMicros == null) {
      if (price?.lastError === 'NOT_FOUND') throw new NotFoundError(`No instrument ${ticker} on Yahoo Finance`, 'TICKER_NOT_FOUND');
      if (price?.lastError === 'UNSUPPORTED_CURRENCY') {
        throw new PriceUnavailableError(`Prices in ${price.nativeCurrency ?? 'that currency'} are not supported`);
      }
      throw new PriceUnavailableError();
    }
    return {
      symbol: ticker,
      name: price.name,
      instrumentType: price.instrumentType,
      assetClass: price.instrumentType === 'CRYPTOCURRENCY' ? 'CRYPTO' : 'SECURITY',
      currency: 'USD',
      price: (price.priceMicros / 1e6).toFixed(6).replace(/0+$/, '').replace(/\.$/, ''),
      time: price.marketTime ?? price.retrievedAt ?? now(this.clock),
      priceMicros: price.priceMicros,
    };
  }

  private needsRefresh(p: Price | undefined, now: Date): boolean {
    if (!p) return true;
    if (isFresh(p, now) && p.priceMicros != null) return false;
    if (p.lastAttemptAt) {
      const since = now.getTime() - new Date(p.lastAttemptAt).getTime();
      if (p.lastError === 'NOT_FOUND' && since < NOT_FOUND_RETRY_MS) return false;
      if (p.lastError && since < FAILURE_BACKOFF_MS) return false;
    }
    return true;
  }

  private async refresh(ticker: string, cached: Price | null): Promise<Price> {
    const at = this.clock.now().toISOString();
    try {
      const quote = await this.provider.quote(ticker);
      const price = await this.toUsd(quote);
      await this.aggregates.putPrice(price);
      return price;
    } catch (e) {
      const code: PriceErrorCode = e instanceof PriceError ? e.code : 'UNAVAILABLE';
      const nativeCurrency = (e as { price?: Price }).price?.nativeCurrency ?? cached?.nativeCurrency ?? null;
      await this.aggregates.recordPriceError(ticker, code, at, nativeCurrency).catch(() => undefined);
      return { ...(cached ?? emptyPrice(ticker)), nativeCurrency, lastError: code, lastAttemptAt: at };
    }
  }

  /** Convert a quote to USD micros; other currencies use the provider's USD{CUR}=X pair. */
  private async toUsd(quote: ProviderQuote): Promise<Price> {
    const now = this.clock.now();
    let currency = quote.currency;
    let nativeMicros = decimalToScaled(quote.price, 6);
    if (MINOR_UNIT_CURRENCIES[currency]) {
      nativeMicros = divRoundHalfEven(nativeMicros, 100n);
      currency = MINOR_UNIT_CURRENCIES[currency]!;
    }
    let priceMicros: bigint;
    let fxRate: string | null = null;
    if (currency.toUpperCase() === 'USD') {
      priceMicros = nativeMicros;
    } else {
      const pair = await this.pairRate(`USD${currency.toUpperCase()}=X`);
      if (!pair) {
        const failed: Price = {
          ...emptyPrice(quote.symbol),
          nativePrice: quote.price,
          nativeCurrency: quote.currency,
          lastError: 'UNSUPPORTED_CURRENCY',
          lastAttemptAt: now.toISOString(),
        };
        throw Object.assign(new PriceError('UNSUPPORTED_CURRENCY', quote.provider), { price: failed });
      }
      fxRate = pair;
      // USD price = native ÷ (units of currency per USD)
      priceMicros = divRoundHalfEven(nativeMicros * 1_000_000n, decimalToScaled(pair, 6));
    }
    return {
      ticker: quote.symbol,
      priceMicros: Number(priceMicros),
      nativePrice: quote.price,
      nativeCurrency: quote.currency,
      fxRate,
      instrumentType: quote.instrumentType,
      name: quote.name,
      provider: quote.provider,
      marketTime: quote.time,
      retrievedAt: now.toISOString(),
      lastAttemptAt: now.toISOString(),
      lastError: null,
      ttl: Math.floor(now.getTime() / 1000) + TTL_DAYS * 86400,
    };
  }

  /** The exchange-rate pair, cached as its own PRICE# item. */
  private async pairRate(pair: string): Promise<string | null> {
    const now = this.clock.now();
    const [cached] = await this.aggregates.getPrices([pair]);
    if (cached?.nativePrice && isFresh(cached, now)) return cached.nativePrice;
    try {
      const q = await this.provider.quote(pair);
      await this.aggregates.putPrice({
        ticker: pair,
        priceMicros: Number(decimalToScaled(q.price, 6)),
        nativePrice: q.price,
        nativeCurrency: q.currency,
        fxRate: null,
        instrumentType: q.instrumentType ?? 'CURRENCY',
        name: q.name,
        provider: q.provider,
        marketTime: q.time,
        retrievedAt: now.toISOString(),
        lastAttemptAt: now.toISOString(),
        lastError: null,
        ttl: Math.floor(now.getTime() / 1000) + TTL_DAYS * 86400,
      });
      return q.price;
    } catch {
      return cached?.nativePrice ?? null;
    }
  }
}

function now(clock: Clock): string {
  return clock.now().toISOString();
}
