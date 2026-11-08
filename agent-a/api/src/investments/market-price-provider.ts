/** A market price feed. `quote` returns the latest price in USD cents or throws `PriceUnavailableError`. */
export interface MarketPriceProvider {
  quote(ticker: string): Promise<number>;
}

export class PriceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceUnavailableError";
  }
}
