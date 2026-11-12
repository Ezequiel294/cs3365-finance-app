import type { BrokerExit, HoldingExit, HoldingValue, Liquidation, Quote, Valuation } from '../../../shared/api-types';
import { FeeCalculator, feeFor } from '../../../shared/fee-calculator';
import { divRoundHalfEven, mulDivRoundHalfEven } from '../../../shared/money';
import type { Broker } from '../../../shared/types';
import type { Clock } from '../clock';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import type { ReferenceRepository } from '../repositories/reference-repository';
import { type PriceClient, isFresh } from './price-client';

/** Value in cents = quantityMicro × priceMicros ÷ 10^10, with BigInt and half-to-even rounding. */
export function holdingValueCents(quantityMicro: number, priceMicros: number): number {
  return Number(divRoundHalfEven(BigInt(quantityMicro) * BigInt(priceMicros), 10_000_000_000n));
}

function oldest(times: Array<string | null | undefined>): string | null {
  const t = times.filter((x): x is string => Boolean(x)).sort();
  return t[0] ?? null;
}

/** Holdings at market prices (07-S02) and the "if I sold everything today" estimate (07-S05). */
export class ValuationService {
  constructor(
    private readonly aggregates: Pick<AggregateRepository, 'getHoldings' | 'getCash'>,
    private readonly reference: Pick<ReferenceRepository, 'listBrokers'>,
    private readonly prices: Pick<PriceClient, 'prices' | 'quote'>,
    private readonly clock: Clock,
  ) {}

  async value(userId: string): Promise<Valuation> {
    const [allHoldings, cash] = await Promise.all([this.aggregates.getHoldings(userId), this.aggregates.getCash(userId)]);
    const holdings = allHoldings.filter((h) => h.quantityMicro > 0);
    const prices = await this.prices.prices(holdings.map((h) => h.ticker));
    const byTicker = new Map(prices.map((p) => [p.ticker, p]));
    const now = this.clock.now();

    const values: HoldingValue[] = holdings.map((holding) => {
      const price = byTicker.get(holding.ticker) ?? null;
      if (!price || price.priceMicros == null) {
        return {
          holding,
          price,
          marketValueCents: null,
          unrealizedGainCents: null,
          gainBps: null,
          shareBps: null,
          priceTime: null,
          stale: false,
        };
      }
      const marketValueCents = holdingValueCents(holding.quantityMicro, price.priceMicros);
      const unrealizedGainCents = marketValueCents - holding.costBasisCents;
      return {
        holding,
        price,
        marketValueCents,
        unrealizedGainCents,
        gainBps: holding.costBasisCents > 0 ? mulDivRoundHalfEven(unrealizedGainCents, 10000, holding.costBasisCents) : 0,
        shareBps: 0,
        priceTime: price.marketTime ?? price.retrievedAt,
        stale: !isFresh(price, now),
      };
    });
    const priced = values.filter((v) => v.marketValueCents != null);
    const totalValueCents = priced.reduce((s, v) => s + v.marketValueCents!, 0);
    const totalCostBasisCents = priced.reduce((s, v) => s + v.holding.costBasisCents, 0);
    for (const v of priced) {
      v.shareBps = totalValueCents > 0 ? mulDivRoundHalfEven(v.marketValueCents!, 10000, totalValueCents) : 0;
    }
    const unrealizedGainCents = totalValueCents - totalCostBasisCents;
    values.sort((a, b) => a.holding.ticker.localeCompare(b.holding.ticker) || a.holding.brokerId.localeCompare(b.holding.brokerId));
    return {
      holdings: values,
      cash,
      totalValueCents,
      totalCostBasisCents,
      unrealizedGainCents,
      gainBps: totalCostBasisCents > 0 ? mulDivRoundHalfEven(unrealizedGainCents, 10000, totalCostBasisCents) : 0,
      priceTime: oldest(priced.map((v) => v.priceTime)),
      unpriced: values.filter((v) => v.marketValueCents == null).map((v) => v.holding.ticker),
    };
  }

  async liquidation(userId: string): Promise<Liquidation> {
    const [valuation, brokers] = await Promise.all([this.value(userId), this.reference.listBrokers(userId)]);
    const byId = new Map<string, Broker>(brokers.map((b) => [b.id, b]));
    const brokerIds = [
      ...new Set([...valuation.holdings.map((h) => h.holding.brokerId), ...valuation.cash.map((c) => c.brokerId)]),
    ].filter((id) => byId.has(id));

    const exits: BrokerExit[] = brokerIds.map((brokerId) => {
      const broker = byId.get(brokerId)!;
      const holdings: HoldingExit[] = valuation.holdings
        .filter((h) => h.holding.brokerId === brokerId && h.marketValueCents != null)
        .map((h) => {
          const fee = feeFor(broker, 'SELL', h.holding.assetClass);
          const sellFeeCents = Math.min(FeeCalculator.fee(fee, h.marketValueCents!), h.marketValueCents!);
          const netCents = h.marketValueCents! - sellFeeCents;
          return {
            ticker: h.holding.ticker,
            marketValueCents: h.marketValueCents!,
            sellFeeCents,
            sellFeeExplained: FeeCalculator.suggest(broker, 'SELL', h.holding.assetClass, h.marketValueCents!).explanation,
            netCents,
            unrealizedGainCents: netCents - h.holding.costBasisCents,
          };
        });
      const cashCents = valuation.cash.find((c) => c.brokerId === brokerId)?.balanceCents ?? 0;
      const proceedsCents = holdings.reduce((s, h) => s + h.netCents, 0) + cashCents;
      const withdrawalFeeCents =
        proceedsCents > 0 ? Math.min(FeeCalculator.fee(broker.fees.withdrawal, proceedsCents), proceedsCents) : 0;
      const grossCents = holdings.reduce((s, h) => s + h.marketValueCents, 0) + cashCents;
      const sellFeesCents = holdings.reduce((s, h) => s + h.sellFeeCents, 0);
      return {
        brokerId,
        brokerName: broker.name,
        holdings,
        cashCents,
        grossCents,
        sellFeesCents,
        proceedsCents,
        withdrawalFeeCents,
        withdrawalFeeExplained:
          proceedsCents > 0
            ? FeeCalculator.suggest(broker, 'WITHDRAWAL', null, proceedsCents).explanation
            : `${broker.name} withdrawal fee: nothing to withdraw`,
        netToBankCents: proceedsCents - withdrawalFeeCents,
        negativeCash: cashCents < 0,
      };
    });
    return {
      brokers: exits,
      totalCents: exits.reduce((s, b) => s + b.netToBankCents, 0),
      priceTime: valuation.priceTime,
      unpriced: valuation.unpriced,
    };
  }

  async quote(ticker: string): Promise<Quote> {
    return this.prices.quote(ticker);
  }
}
