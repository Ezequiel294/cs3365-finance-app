import { decimalToScaled } from "../fx/fx-service";
import type { ParameterStore } from "../repositories/parameter-store";
import { PriceUnavailableError, type MarketPriceProvider } from "./market-price-provider";

type FetchFn = typeof fetch;

export const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const MISSING_KEY_RECHECK_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Twelve Data (`GET /price?symbol=VOO&apikey=...` → `{"price":"512.34"}`), chosen for its free
 * Basic plan that covers US stocks, ETFs, funds, and crypto pairs such as `BTC/USD`.
 * The API key comes from SSM (`/FinanceApp/prices/apiKey`). While that parameter does not exist,
 * every quote fails with `PriceUnavailableError` and prices are reported as unavailable.
 */
export class HttpMarketPriceProvider implements MarketPriceProvider {
  private apiKey?: string;
  private missingSince?: number;

  constructor(
    private readonly parameters: ParameterStore,
    private readonly apiKeyParam: string,
    private readonly fetchFn: FetchFn = fetch,
    private readonly baseUrl: string = TWELVE_DATA_BASE_URL,
  ) {}

  async quote(ticker: string): Promise<number> {
    const apiKey = await this.key();
    const url = `${this.baseUrl}/price?${new URLSearchParams({ symbol: ticker, apikey: apiKey }).toString()}`;
    let body: { price?: string; status?: string; code?: number };
    try {
      const response = await this.fetchFn(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.status !== 200) throw new PriceUnavailableError(`price feed answered ${response.status}`);
      body = (await response.json()) as typeof body;
    } catch (error) {
      if (error instanceof PriceUnavailableError) throw error;
      throw new PriceUnavailableError("price feed unreachable");
    }
    if (body.status === "error" || typeof body.price !== "string") throw new PriceUnavailableError(`no price for ${ticker}`);
    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) throw new PriceUnavailableError(`no price for ${ticker}`);
    // Dollars with up to 5 decimals → cents, half-to-even, from the decimal text.
    const scaled = decimalToScaled(price, 6); // millionths of a dollar
    let cents = scaled / 10_000n;
    const remainder = (scaled % 10_000n) * 2n;
    if (remainder > 10_000n || (remainder === 10_000n && cents % 2n === 1n)) cents += 1n;
    return Number(cents);
  }

  private async key(): Promise<string> {
    if (this.apiKey) return this.apiKey;
    if (this.missingSince && Date.now() - this.missingSince < MISSING_KEY_RECHECK_MS) {
      throw new PriceUnavailableError("price API key is not configured");
    }
    let value: string | undefined;
    try {
      value = await this.parameters.getOptional(this.apiKeyParam);
    } catch {
      value = undefined;
    }
    if (!value) {
      this.missingSince = Date.now();
      throw new PriceUnavailableError("price API key is not configured");
    }
    this.apiKey = value;
    return value;
  }
}
