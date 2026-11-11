import {
  FeeCalculator,
  feeFor,
  marketValueCents,
  type Broker,
  type BrokerExit,
  type HoldingValue,
  type Liquidation,
  type Quote,
  type Valuation,
} from '@finance/shared';
import type { Clock } from '../clock';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import type { ReferenceRepository } from '../repositories/reference-repository';
import { isFresh, type PriceClient } from './price-client';

/** Portfolio value at market prices (07-S02) and the "if I sold today" estimate (07-S05). */
export class ValuationService {
  constructor(
    private readonly aggregates: AggregateRepository,
    private readonly reference: ReferenceRepository,
    private readonly prices: PriceClient,
    private readonly clock: Clock,
  ) {}

  async value(userId: string): Promise<Valuation> {
    const [holdings, cash] = await Promise.all([this.aggregates.getHoldings(userId), this.aggregates.getCash(userId)]);
    const open = holdings.filter((h) => h.quantityMicro > 0);
    const prices = new Map((await this.prices.prices(open.map((h) => h.ticker))).map((p) => [p.ticker, p]));
    const now = this.clock.now();
    const values: HoldingValue[] = open.map((holding) => {
      const price = prices.get(holding.ticker) ?? null;
      const hasPrice = price?.priceMicros !== null && price?.priceMicros !== undefined;
      return {
        holding,
        price,
        marketValueCents: hasPrice ? marketValueCents(holding.quantityMicro, price!.priceMicros!) : null,
        stale: hasPrice ? !isFresh(price, now) : false,
      };
    });
    return {
      holdings: values.sort((a, b) => a.holding.ticker.localeCompare(b.holding.ticker)),
      cash,
      totalValueCents: values.reduce((sum, v) => sum + (v.marketValueCents ?? 0), 0),
      unpriced: values.filter((v) => v.marketValueCents === null).map((v) => v.holding.ticker),
    };
  }

  /** Sell every priced holding with its broker's sell fee, add cash, and take the withdrawal fee once. Before taxes. */
  async liquidation(userId: string): Promise<Liquidation> {
    const [valuation, brokers] = await Promise.all([this.value(userId), this.reference.listBrokers(userId)]);
    const brokerIds = new Set([...valuation.holdings.map((h) => h.holding.brokerId), ...valuation.cash.map((c) => c.brokerId)]);
    const byId = new Map(brokers.map((b) => [b.id, b]));
    let oldestPrice: string | null = null;

    const exits: BrokerExit[] = [...brokerIds].map((brokerId) => {
      const broker: Broker = byId.get(brokerId) ?? { id: brokerId, name: brokerId, fees: emptyFees(), version: 0 };
      const holdings = valuation.holdings
        .filter((h) => h.holding.brokerId === brokerId && h.marketValueCents !== null)
        .map((h) => {
          const fee = feeFor(broker.fees, 'SELL', h.holding.assetClass);
          const sellFeeCents = FeeCalculator.fee(fee, h.marketValueCents!);
          const time = h.price?.retrievedAt ?? null;
          if (time && (!oldestPrice || time < oldestPrice)) oldestPrice = time;
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
      const proceedsCents = holdings.reduce((sum, h) => sum + h.netCents, 0) + cashCents;
      const withdrawalFeeCents = proceedsCents > 0 ? FeeCalculator.fee(broker.fees.withdrawal, proceedsCents) : 0;
      return {
        brokerId,
        brokerName: broker.name,
        holdings,
        cashCents,
        proceedsCents,
        withdrawalFeeCents,
        withdrawalFeeExplained:
          proceedsCents > 0 ? FeeCalculator.suggest(broker, 'WITHDRAWAL', null, proceedsCents).explanation : 'nothing to withdraw',
        netToBankCents: proceedsCents - withdrawalFeeCents,
        negativeCash: cashCents < 0,
      };
    });
    return {
      brokers: exits.sort((a, b) => a.brokerName.localeCompare(b.brokerName)),
      totalCents: exits.reduce((sum, e) => sum + e.netToBankCents, 0),
      priceTime: oldestPrice,
      unpriced: valuation.unpriced,
    };
  }

  async quote(ticker: string): Promise<Quote> {
    return this.prices.quote(ticker);
  }
}

function emptyFees(): Broker['fees'] {
  const zero = { flatCents: 0, percentBps: 0 };
  return { deposit: zero, withdrawal: zero, buy: { security: zero, crypto: zero }, sell: { security: zero, crypto: zero } };
}
