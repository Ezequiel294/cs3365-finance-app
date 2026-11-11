import type { Quote, PriceErrorCode } from '@finance/shared';
import type { FetchFn } from './bccr-rate-provider';

export class PriceError extends Error {
  constructor(
    readonly code: PriceErrorCode,
    readonly provider: string,
    readonly httpStatus?: number,
  ) {
    super(`${provider}: ${code}${httpStatus ? ` (${httpStatus})` : ''}`);
    this.name = 'PriceError';
  }
}

export interface MarketPriceProvider {
  readonly name: string;
  supports?(symbol: string): boolean;
  quote(symbol: string): Promise<Quote>;
}

function assetClassFor(instrumentType: string): Quote['assetClass'] {
  return instrumentType === 'CRYPTOCURRENCY' ? 'CRYPTO' : 'SECURITY';
}

function logPriceFailure(provider: string, symbol: string, code: string, status?: number) {
  console.warn(JSON.stringify({ msg: 'price lookup failed', provider, ticker: symbol, code, status }));
}

/** Yahoo Finance chart API: no key; stocks, ETFs, funds, crypto, and non-US exchanges. */
export class YahooChartPriceProvider implements MarketPriceProvider {
  readonly name = 'yahoo';

  constructor(
    private readonly fetchFn: FetchFn = fetch,
    private readonly userAgent = 'Mozilla/5.0',
  ) {}

  async quote(symbol: string): Promise<Quote> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    let res: Response;
    try {
      res = await this.fetchFn(url, { headers: { 'User-Agent': this.userAgent }, signal: AbortSignal.timeout(4000) });
    } catch {
      logPriceFailure(this.name, symbol, 'UNAVAILABLE');
      throw new PriceError('UNAVAILABLE', this.name);
    }
    if (res.status === 404) {
      logPriceFailure(this.name, symbol, 'NOT_FOUND', 404);
      throw new PriceError('NOT_FOUND', this.name, 404);
    }
    if (res.status !== 200) {
      logPriceFailure(this.name, symbol, 'UNAVAILABLE', res.status);
      throw new PriceError('UNAVAILABLE', this.name, res.status);
    }
    let body: any;
    try {
      body = await res.json();
    } catch {
      throw new PriceError('UNAVAILABLE', this.name, 200);
    }
    const meta = body?.chart?.result?.[0]?.meta;
    if (!meta && body?.chart?.error?.code === 'Not Found') throw new PriceError('NOT_FOUND', this.name, 200);
    if (!meta || typeof meta.regularMarketPrice !== 'number') {
      logPriceFailure(this.name, symbol, 'UNAVAILABLE', 200);
      throw new PriceError('UNAVAILABLE', this.name, 200);
    }
    const instrumentType = String(meta.instrumentType ?? 'EQUITY');
    const time = typeof meta.regularMarketTime === 'number' ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString();
    return {
      symbol,
      name: String(meta.longName ?? meta.shortName ?? symbol),
      instrumentType,
      assetClass: assetClassFor(instrumentType),
      currency: String(meta.currency ?? 'USD'),
      price: String(meta.regularMarketPrice),
      time,
    };
  }
}

/** Optional fallback, only built when its API key exists in SSM. US symbols and crypto pairs only. */
export class TwelveDataPriceProvider implements MarketPriceProvider {
  readonly name = 'twelvedata';

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private isCrypto(symbol: string): boolean {
    return /^[A-Z0-9]+-(USD|USDT|EUR)$/.test(symbol);
  }

  supports(symbol: string): boolean {
    if (symbol.endsWith('=X')) return false;
    return this.isCrypto(symbol) || !symbol.includes('.');
  }

  async quote(symbol: string): Promise<Quote> {
    const crypto = this.isCrypto(symbol);
    const tdSymbol = crypto ? symbol.replace('-', '/') : symbol;
    const url = `https://api.twelvedata.com/price?${new URLSearchParams({ symbol: tdSymbol, apikey: this.apiKey })}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, { signal: AbortSignal.timeout(4000) });
    } catch {
      throw new PriceError('UNAVAILABLE', this.name);
    }
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      throw new PriceError('UNAVAILABLE', this.name, res.status);
    }
    if (body?.status === 'error' || res.status !== 200 || typeof body?.price !== 'string') {
      const code = body?.code === 404 || (body?.code === 400 && /symbol/i.test(String(body?.message))) ? 'NOT_FOUND' : 'UNAVAILABLE';
      logPriceFailure(this.name, symbol, code, res.status);
      throw new PriceError(code, this.name, res.status);
    }
    const instrumentType = crypto ? 'CRYPTOCURRENCY' : 'EQUITY';
    return {
      symbol,
      name: symbol,
      instrumentType,
      assetClass: assetClassFor(instrumentType),
      currency: 'USD',
      price: body.price,
      time: new Date().toISOString(),
    };
  }
}

/**
 * Asks Yahoo first and then each provider that supports the symbol; returns the
 * first quote. Throws NOT_FOUND only when every provider said so.
 * `loadExtra` adds providers lazily (Twelve Data, once its key is known to exist).
 */
export class FallbackPriceProvider implements MarketPriceProvider {
  readonly name = 'fallback';
  private extra: Promise<MarketPriceProvider[]> | null = null;

  constructor(
    private readonly providers: MarketPriceProvider[],
    private readonly loadExtra?: () => Promise<MarketPriceProvider[]>,
  ) {}

  private async all(): Promise<MarketPriceProvider[]> {
    if (!this.loadExtra) return this.providers;
    if (!this.extra) {
      this.extra = this.loadExtra().catch(() => {
        this.extra = null;
        return [];
      });
    }
    return [...this.providers, ...(await this.extra)];
  }

  async quote(symbol: string): Promise<Quote> {
    const errors: PriceError[] = [];
    for (const provider of await this.all()) {
      if (provider.supports && !provider.supports(symbol)) continue;
      try {
        return { ...(await provider.quote(symbol)), symbol };
      } catch (err) {
        errors.push(err instanceof PriceError ? err : new PriceError('UNAVAILABLE', provider.name));
      }
    }
    const allNotFound = errors.length > 0 && errors.every((e) => e.code === 'NOT_FOUND');
    throw new PriceError(allNotFound ? 'NOT_FOUND' : 'UNAVAILABLE', errors.map((e) => e.provider).join(',') || 'none');
  }
}
