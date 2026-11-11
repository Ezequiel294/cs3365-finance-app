import { divRoundHalfEven, formatQuantity, type Holding, type InvestmentTransaction } from '@finance/shared';
import { ConflictError } from '../errors';

export interface SellResult {
  holding: Holding;
  costRemovedCents: number;
  realizedGainCents: number;
}

export interface ReplayResult {
  holding: Holding;
  /** Realized gain of each SELL, by transaction id. */
  realizedById: Map<string, number>;
}

/** Average-cost holding arithmetic and the cash effect of each investment type. */
export class HoldingCalculator {
  applyBuy(holding: Holding | null, tx: InvestmentTransaction): Holding {
    const base: Holding = holding ?? {
      brokerId: tx.brokerId,
      ticker: tx.ticker!,
      assetClass: tx.assetClass ?? 'SECURITY',
      name: tx.name ?? null,
      quantityMicro: 0,
      costBasisCents: 0,
      realizedGainCents: 0,
      version: 0,
    };
    return {
      ...base,
      name: base.name ?? tx.name ?? null,
      quantityMicro: base.quantityMicro + (tx.quantityMicro ?? 0),
      costBasisCents: base.costBasisCents + (tx.grossCents ?? 0) + tx.commissionCents,
    };
  }

  /** Removes `costBasis × sold ÷ quantity`; `realizedGain = gross − commission − costRemoved`. */
  applySell(holding: Holding | null, tx: InvestmentTransaction): SellResult {
    const sold = tx.quantityMicro ?? 0;
    if (!holding || holding.quantityMicro < sold) {
      const have = holding ? formatQuantity(holding.quantityMicro) : '0';
      throw new ConflictError(`You can't sell ${formatQuantity(sold)} ${tx.ticker}: the holding has ${have} units`);
    }
    const costRemovedCents =
      sold === holding.quantityMicro
        ? holding.costBasisCents
        : Number(divRoundHalfEven(BigInt(holding.costBasisCents) * BigInt(sold), BigInt(holding.quantityMicro)));
    const realizedGainCents = (tx.grossCents ?? 0) - tx.commissionCents - costRemovedCents;
    return {
      holding: {
        ...holding,
        quantityMicro: holding.quantityMicro - sold,
        costBasisCents: holding.costBasisCents - costRemovedCents,
        realizedGainCents: holding.realizedGainCents + realizedGainCents,
      },
      costRemovedCents,
      realizedGainCents,
    };
  }

  /** Rebuilds a holding from every trade of one ticker at one broker, in date order. */
  replay(trades: InvestmentTransaction[]): ReplayResult {
    const ordered = [...trades].sort((a, b) =>
      a.localDate === b.localDate ? (a.createdAt < b.createdAt ? -1 : 1) : a.localDate < b.localDate ? -1 : 1,
    );
    let holding: Holding | null = null;
    const realizedById = new Map<string, number>();
    for (const tx of ordered) {
      if (tx.type === 'BUY') holding = this.applyBuy(holding, tx);
      else if (tx.type === 'SELL') {
        const result = this.applySell(holding, tx);
        holding = result.holding;
        realizedById.set(tx.id, result.realizedGainCents);
      }
    }
    if (!holding) throw new ConflictError('No trades left for this holding');
    return { holding, realizedById };
  }

  /** Change of the broker's cash: deposit + (sent − fee), buy − (gross + fee), sell + (gross − fee), withdrawal − amount. */
  cashDelta(tx: InvestmentTransaction): number {
    switch (tx.type) {
      case 'DEPOSIT':
        return (tx.amountCents ?? 0) - tx.commissionCents;
      case 'WITHDRAWAL':
        return -(tx.amountCents ?? 0);
      case 'BUY':
        return -((tx.grossCents ?? 0) + tx.commissionCents);
      case 'SELL':
        return (tx.grossCents ?? 0) - tx.commissionCents;
    }
  }

  /** The transaction's contribution to `MONTH#<yyyy-mm>#INV`. */
  monthContribution(tx: InvestmentTransaction): Record<string, number> {
    const c: Record<string, number> = { commissionsCents: tx.commissionCents };
    if (tx.type === 'DEPOSIT') c.depositedCents = tx.amountCents ?? 0;
    if (tx.type === 'WITHDRAWAL') c.withdrawnCents = tx.amountCents ?? 0;
    if (tx.type === 'BUY') c.boughtCents = tx.grossCents ?? 0;
    if (tx.type === 'SELL') {
      c.soldCents = tx.grossCents ?? 0;
      c.realizedGainCents = tx.realizedGainCents ?? 0;
    }
    return c;
  }
}
