import type { PriceErrorCode } from '../../../shared/types';

type FetchFn = typeof fetch;

/** What a provider returns: the price in the currency it quoted. */
export interface ProviderQuote {
  symbol: string;
  name: string | null;
  instrumentType: string | null;
  currency: string;
  /** Decimal string, in `currency`. */
  price: string;
  /** Market time (ISO). */
  time: string;
  provider: string;
}

export class PriceError extends Error {
  constructor(
    readonly code: PriceErrorCode,
    readonly provider: string,
    readonly httpStatus: number | null = null,
  ) {
    super(`${provider}: ${code}`);
    this.name = 'PriceError';
  }
}

export interface MarketPriceProvider {
  quote(symbol: string): Promise<ProviderQuote>;
  supports?(symbol: string): boolean;
}

function log(provider: string, symbol: string, status: number | null, code: string): void {
  // Ticker, provider, HTTP status, and error code only; never amounts or keys.
  console.warn(JSON.stringify({ msg: 'price lookup failed', provider, ticker: symbol, status, code }));
}

/** Primary provider: Yahoo Finance chart API, no key. */
export class YahooChartPriceProvider implements MarketPriceProvider {
  constructor(
    private readonly fetchFn: FetchFn = fetch,
    private readonly userAgent = 'Mozilla/5.0',
    private readonly timeoutMs = 4000,
  ) {}

  async quote(symbol: string): Promise<ProviderQuote> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      log('yahoo', symbol, null, 'UNAVAILABLE');
      throw new PriceError('UNAVAILABLE', 'yahoo');
    }
    if (res.status === 404) {
      log('yahoo', symbol, 404, 'NOT_FOUND');
      throw new PriceError('NOT_FOUND', 'yahoo', 404);
    }
    if (res.status !== 200) {
      log('yahoo', symbol, res.status, 'UNAVAILABLE');
      throw new PriceError('UNAVAILABLE', 'yahoo', res.status);
    }
    let body: any;
    try {
      body = await res.json();
    } catch {
      throw new PriceError('UNAVAILABLE', 'yahoo', 200);
    }
    const result = body?.chart?.result?.[0];
    if (!result && body?.chart?.error?.code === 'Not Found') throw new PriceError('NOT_FOUND', 'yahoo', 200);
    const meta = result?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') {
      log('yahoo', symbol, 200, 'UNAVAILABLE');
      throw new PriceError('UNAVAILABLE', 'yahoo', 200);
    }
    return {
      symbol,
      name: meta.longName ?? meta.shortName ?? null,
      instrumentType: meta.instrumentType ?? null,
      currency: meta.currency ?? 'USD',
      price: String(meta.regularMarketPrice),
      time: new Date((meta.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(),
      provider: 'yahoo',
    };
  }
}

/** Optional fallback: Twelve Data, only built when its key exists in SSM. */
export class TwelveDataPriceProvider implements MarketPriceProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => Date = () => new Date(),
    private readonly timeoutMs = 4000,
  ) {}

  private isCrypto(symbol: string): boolean {
    return /^[A-Z0-9]+-(USD|USDT|EUR)$/.test(symbol);
  }

  /** US symbols (no "." suffix) and crypto pairs. */
  supports(symbol: string): boolean {
    return this.isCrypto(symbol) || /^[A-Z][A-Z0-9-]*$/.test(symbol);
  }

  async quote(symbol: string): Promise<ProviderQuote> {
    const crypto = this.isCrypto(symbol);
    const tdSymbol = crypto ? symbol.replace('-', '/') : symbol;
    const q = new URLSearchParams({ symbol: tdSymbol, apikey: this.apiKey });
    let res: Response;
    try {
      res = await this.fetchFn(`https://api.twelvedata.com/price?${q.toString()}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      log('twelvedata', symbol, null, 'UNAVAILABLE');
      throw new PriceError('UNAVAILABLE', 'twelvedata');
    }
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!body || body.status === 'error' || !body.price) {
      const code: PriceErrorCode = body?.code === 404 || body?.code === 400 ? 'NOT_FOUND' : 'UNAVAILABLE';
      log('twelvedata', symbol, res.status, code);
      throw new PriceError(code, 'twelvedata', res.status);
    }
    return {
      symbol,
      name: null,
      instrumentType: crypto ? 'CRYPTOCURRENCY' : null,
      currency: crypto ? tdSymbol.split('/')[1]! : 'USD',
      price: String(body.price),
      // This endpoint returns no trade time, so the fetch time is used.
      time: this.now().toISOString(),
      provider: 'twelvedata',
    };
  }
}

/** Yahoo first, then each provider that supports the symbol; NOT_FOUND only when every one said so. */
export class FallbackPriceProvider implements MarketPriceProvider {
  private extras: Promise<MarketPriceProvider[]> | null = null;

  constructor(
    private readonly providers: MarketPriceProvider[],
    private readonly loadExtras: () => Promise<MarketPriceProvider[]> = async () => [],
  ) {}

  private async all(): Promise<MarketPriceProvider[]> {
    if (!this.extras) {
      this.extras = this.loadExtras().catch(() => []);
    }
    return [...this.providers, ...(await this.extras)];
  }

  async quote(symbol: string): Promise<ProviderQuote> {
    const providers = await this.all();
    const errors: PriceError[] = [];
    for (const [i, p] of providers.entries()) {
      if (i > 0 && p.supports && !p.supports(symbol)) continue;
      try {
        return await p.quote(symbol);
      } catch (e) {
        if (e instanceof PriceError) errors.push(e);
        else errors.push(new PriceError('UNAVAILABLE', 'unknown'));
      }
    }
    const allNotFound = errors.length > 0 && errors.every((e) => e.code === 'NOT_FOUND');
    throw new PriceError(allNotFound ? 'NOT_FOUND' : 'UNAVAILABLE', errors[0]?.provider ?? 'none');
  }
}
