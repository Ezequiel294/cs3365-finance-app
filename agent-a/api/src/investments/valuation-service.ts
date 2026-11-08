import type { HoldingExit, HoldingValue, Liquidation, Valuation } from "@finance/shared";
import type { AggregateRepository } from "../repositories/aggregate-repository";
import type { ReferenceRepository } from "../repositories/reference-repository";
import { mulDivRound, sellCommission } from "./holding-calculator";
import type { PriceClient } from "./price-client";

/** Values holdings at market prices (07-S02) and estimates what selling everything would return (07-S05). */
export class ValuationService {
  constructor(
    private readonly aggregates: AggregateRepository,
    private readonly reference: ReferenceRepository,
    private readonly prices: PriceClient,
  ) {}

  async value(userId: string): Promise<Valuation> {
    const holdings = (await this.aggregates.getHoldings(userId)).filter((h) => h.quantityMicro > 0);
    const prices = await this.prices.prices(holdings.map((h) => h.ticker));
    const values: HoldingValue[] = holdings.map((holding) => {
      const price = prices.get(holding.ticker);
      return {
        holding,
        price,
        marketValueCents: price ? mulDivRound(holding.quantityMicro, price.priceCents, 1_000_000) : undefined,
      };
    });
    return {
      holdings: values,
      totalValueCents: values.reduce((sum, v) => sum + (v.marketValueCents ?? 0), 0),
      incomplete: values.some((v) => v.marketValueCents === undefined),
    };
  }

  /** Before-tax estimate: market value minus each broker's sell commission, plus broker cash. Never a recommendation. */
  async liquidation(userId: string): Promise<Liquidation> {
    const [valuation, brokers, cash] = await Promise.all([
      this.value(userId),
      this.reference.listBrokers(userId),
      this.aggregates.getCash(userId),
    ]);
    const rules = new Map(brokers.map((b) => [b.id, b]));
    const exits: HoldingExit[] = valuation.holdings.map(({ holding, price, marketValueCents }) => {
      const base = {
        brokerId: holding.brokerId,
        ticker: holding.ticker,
        quantityMicro: holding.quantityMicro,
        costBasisCents: holding.costBasisCents,
        priceAvailable: marketValueCents !== undefined,
        stale: price?.stale ?? false,
      };
      if (marketValueCents === undefined) return base;
      const rule = rules.get(holding.brokerId) ?? { flatCents: 0, percentBps: 0 };
      const sellCommissionCents = sellCommission(rule, marketValueCents);
      const netCents = marketValueCents - sellCommissionCents;
      return { ...base, marketValueCents, sellCommissionCents, netCents, unrealizedGainCents: netCents - holding.costBasisCents };
    });
    const cashCents = cash.reduce((sum, c) => sum + c.balanceCents, 0);
    const priceTimes = valuation.holdings.map((h) => h.price?.retrievedAt).filter((t): t is string => !!t).sort();
    return {
      holdings: exits,
      cash,
      cashCents,
      totalCents: exits.reduce((sum, e) => sum + (e.netCents ?? 0), 0) + cashCents,
      priceTime: priceTimes[0],
      incomplete: valuation.incomplete,
    };
  }
}
