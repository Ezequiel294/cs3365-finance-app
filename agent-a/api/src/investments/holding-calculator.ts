import { divRoundHalfEven } from '../../../shared/money';
import type { Holding, InvestmentTransaction } from '../../../shared/types';
import { ConflictError } from '../http/errors';
import type { InvestmentMonthDelta } from '../repositories/aggregate-repository';

export interface SellResult {
  holding: Holding;
  costRemovedCents: number;
  realizedGainCents: number;
}

type Trade = Pick<
  InvestmentTransaction,
  'id' | 'type' | 'brokerId' | 'ticker' | 'assetClass' | 'quantityMicro' | 'grossCents' | 'commissionCents' | 'name' | 'localDate' | 'createdAt' | 'amountCents'
>;

/** Average-cost holdings and broker cash arithmetic (class diagram section 10a). */
export class HoldingCalculator {
  applyBuy(holding: Holding | null, tx: Trade): Holding {
    return {
      brokerId: tx.brokerId,
      ticker: tx.ticker!,
      assetClass: tx.assetClass ?? holding?.assetClass ?? 'SECURITY',
      name: tx.name ?? holding?.name ?? null,
      quantityMicro: (holding?.quantityMicro ?? 0) + tx.quantityMicro,
      costBasisCents: (holding?.costBasisCents ?? 0) + tx.grossCents + tx.commissionCents,
      realizedGainCents: holding?.realizedGainCents ?? 0,
      version: (holding?.version ?? 0) + 1,
    };
  }

  /** Removes cost × sold ÷ quantity; realized gain = gross − commission − cost removed. */
  applySell(holding: Holding | null, tx: Trade): SellResult {
    if (!holding || holding.quantityMicro < tx.quantityMicro) {
      throw new ConflictError(
        `You can sell at most ${((holding?.quantityMicro ?? 0) / 1e6).toString()} units of ${tx.ticker}.`,
        'INSUFFICIENT_UNITS',
      );
    }
    const costRemovedCents = Number(
      divRoundHalfEven(BigInt(holding.costBasisCents) * BigInt(tx.quantityMicro), BigInt(holding.quantityMicro)),
    );
    const realizedGainCents = tx.grossCents - tx.commissionCents - costRemovedCents;
    return {
      holding: {
        ...holding,
        name: holding.name ?? tx.name ?? null,
        quantityMicro: holding.quantityMicro - tx.quantityMicro,
        costBasisCents: holding.costBasisCents - costRemovedCents,
        realizedGainCents: holding.realizedGainCents + realizedGainCents,
        version: holding.version + 1,
      },
      costRemovedCents,
      realizedGainCents,
    };
  }

  /** Rebuild a holding from all its trades in date order; returns each sell's realized gain too. */
  replay(trades: Trade[]): { holding: Holding | null; realizedById: Map<string, number> } {
    const sorted = [...trades].sort((a, b) =>
      a.localDate === b.localDate ? a.createdAt.localeCompare(b.createdAt) : a.localDate.localeCompare(b.localDate),
    );
    let holding: Holding | null = null;
    const realizedById = new Map<string, number>();
    for (const t of sorted) {
      if (t.type === 'BUY') holding = this.applyBuy(holding, t);
      else if (t.type === 'SELL') {
        const r = this.applySell(holding, t);
        holding = r.holding;
        realizedById.set(t.id, r.realizedGainCents);
      }
    }
    return { holding, realizedById };
  }

  /** The change to the broker's cash. */
  cashDelta(tx: Pick<InvestmentTransaction, 'type' | 'amountCents' | 'grossCents' | 'commissionCents'>): number {
    switch (tx.type) {
      case 'DEPOSIT':
        return tx.amountCents - tx.commissionCents;
      case 'WITHDRAWAL':
        return -tx.amountCents;
      case 'BUY':
        return -(tx.grossCents + tx.commissionCents);
      case 'SELL':
        return tx.grossCents - tx.commissionCents;
    }
  }

  /** The MONTH#<yyyy-mm>#INV contribution of a transaction. */
  monthDelta(
    tx: Pick<InvestmentTransaction, 'type' | 'amountCents' | 'grossCents' | 'commissionCents' | 'localDate'>,
    realizedGainCents = 0,
  ): InvestmentMonthDelta {
    const month = tx.localDate.slice(0, 7);
    switch (tx.type) {
      case 'DEPOSIT':
        return { month, depositedCents: tx.amountCents, commissionsCents: tx.commissionCents };
      case 'WITHDRAWAL':
        return { month, withdrawnCents: tx.amountCents, commissionsCents: tx.commissionCents };
      case 'BUY':
        return { month, boughtCents: tx.grossCents, commissionsCents: tx.commissionCents };
      case 'SELL':
        return { month, soldCents: tx.grossCents, commissionsCents: tx.commissionCents, realizedGainCents };
    }
  }
}

export function subtractMonthDelta(a: InvestmentMonthDelta, b: InvestmentMonthDelta): InvestmentMonthDelta {
  const keys = ['depositedCents', 'withdrawnCents', 'boughtCents', 'soldCents', 'commissionsCents', 'realizedGainCents'] as const;
  const out: InvestmentMonthDelta = { month: a.month };
  for (const k of keys) out[k] = (a[k] ?? 0) - (b[k] ?? 0);
  return out;
}
