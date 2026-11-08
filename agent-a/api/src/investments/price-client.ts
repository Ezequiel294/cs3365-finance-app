import type { Price } from "@finance/shared";
import type { Clock } from "../clock";
import type { AggregateRepository } from "../repositories/aggregate-repository";
import type { MarketPriceProvider } from "./market-price-provider";

export const PRICE_FRESH_MS = 15 * 60 * 1000;

/**
 * Prices with a shared 15-minute cache (`PRICE#<ticker>`). On a miss it asks the provider; when the
 * provider fails it returns the last known price marked `stale`, and when there is none the ticker
 * is left out (price unavailable).
 */
export class PriceClient {
  constructor(
    private readonly aggregates: AggregateRepository,
    private readonly provider: MarketPriceProvider,
    private readonly clock: Clock,
  ) {}

  async prices(tickers: string[]): Promise<Map<string, Price>> {
    const unique = [...new Set(tickers)];
    const cached = new Map((await this.aggregates.getPrices(unique)).map((p) => [p.ticker, p]));
    const now = this.clock.now();
    const out = new Map<string, Price>();
    for (const ticker of unique) {
      const hit = cached.get(ticker);
      if (hit && now.getTime() - Date.parse(hit.retrievedAt) < PRICE_FRESH_MS) {
        out.set(ticker, { ...hit, stale: false });
        continue;
      }
      try {
        const priceCents = await this.provider.quote(ticker);
        const fresh: Price = { ticker, priceCents, retrievedAt: now.toISOString(), stale: false };
        await this.aggregates.putPrice(fresh);
        out.set(ticker, fresh);
      } catch (error) {
        console.warn(JSON.stringify({ msg: "price unavailable", ticker, reason: (error as Error)?.message }));
        if (hit) out.set(ticker, { ...hit, stale: true });
      }
    }
    return out;
  }
}
