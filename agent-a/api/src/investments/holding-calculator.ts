import type { Broker, Holding, InvestmentTransaction } from "@finance/shared";
import { ConflictError } from "../http/errors";
import type { InvestmentMonthChange } from "../repositories/aggregate-repository";

export interface SellResult {
  holding: Holding;
  costRemovedCents: number;
  realizedGainCents: number;
}

export interface ReplayResult {
  holding: Holding;
  /** Realized gain of each sale, by investment transaction ID. */
  gains: Map<string, number>;
}

/** `a × b ÷ c` with integer arithmetic, rounded half-to-even. */
export function mulDivRound(a: number, b: number, c: number): number {
  if (c === 0) throw new Error("division by zero");
  const n = BigInt(a) * BigInt(b);
  const d = BigInt(c);
  const negative = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  let q = an / ad;
  const r2 = (an % ad) * 2n;
  if (r2 > ad || (r2 === ad && q % 2n === 1n)) q += 1n;
  return Number(negative ? -q : q);
}

/** `Broker.sellCommission`: `flatCents + marketValueCents × percentBps ÷ 10000`. */
export function sellCommission(broker: Pick<Broker, "flatCents" | "percentBps">, marketValueCents: number): number {
  return broker.flatCents + mulDivRound(marketValueCents, broker.percentBps, 10_000);
}

/** Average-cost holding arithmetic. Buys add units and cost (gross + commission); sells remove cost pro rata. */
export class HoldingCalculator {
  applyBuy(holding: Holding, tx: InvestmentTransaction): Holding {
    return {
      ...holding,
      quantityMicro: holding.quantityMicro + (tx.quantityMicro ?? 0),
      costBasisCents: holding.costBasisCents + (tx.grossCents ?? 0) + tx.commissionCents,
    };
  }

  applySell(holding: Holding, tx: InvestmentTransaction): SellResult {
    const sold = tx.quantityMicro ?? 0;
    if (sold > holding.quantityMicro) throw new ConflictError("You hold fewer units than this sale", "INSUFFICIENT_HOLDING");
    const costRemovedCents = sold === holding.quantityMicro ? holding.costBasisCents : mulDivRound(holding.costBasisCents, sold, holding.quantityMicro);
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

  /** Rebuilds a holding from all its trades in date order (an edited old trade changes every later sale). */
  replay(trades: InvestmentTransaction[]): Holding {
    return this.replayDetailed(trades).holding;
  }

  replayDetailed(trades: InvestmentTransaction[]): ReplayResult {
    const ordered = [...trades].sort((a, b) => a.localDate.localeCompare(b.localDate) || a.createdAt.localeCompare(b.createdAt));
    const first = ordered[0];
    let holding: Holding = {
      brokerId: first?.brokerId ?? "",
      ticker: first?.ticker ?? "",
      quantityMicro: 0,
      costBasisCents: 0,
      realizedGainCents: 0,
      version: 0,
    };
    const gains = new Map<string, number>();
    for (const tx of ordered) {
      if (tx.type === "BUY") holding = this.applyBuy(holding, tx);
      else if (tx.type === "SELL") {
        const result = this.applySell(holding, tx);
        holding = result.holding;
        gains.set(tx.id, result.realizedGainCents);
      }
    }
    return { holding, gains };
  }

  /** How a transaction changes the broker's uninvested cash. */
  cashDelta(tx: InvestmentTransaction): number {
    switch (tx.type) {
      case "DEPOSIT":
        return (tx.amountCents ?? 0) - tx.commissionCents;
      case "WITHDRAWAL":
        return -(tx.amountCents ?? 0);
      case "BUY":
        return -((tx.grossCents ?? 0) + tx.commissionCents);
      case "SELL":
        return (tx.grossCents ?? 0) - tx.commissionCents;
    }
  }

  /** What a transaction adds to its `MONTH#<m>#INV` rollup. */
  monthChange(tx: InvestmentTransaction, realizedGainCents = 0): InvestmentMonthChange {
    switch (tx.type) {
      case "DEPOSIT":
        return { depositedCents: tx.amountCents ?? 0, commissionsCents: tx.commissionCents };
      case "WITHDRAWAL":
        return { withdrawnCents: tx.amountCents ?? 0, commissionsCents: tx.commissionCents };
      case "BUY":
        return { boughtCents: tx.grossCents ?? 0, commissionsCents: tx.commissionCents };
      case "SELL":
        return { soldCents: tx.grossCents ?? 0, commissionsCents: tx.commissionCents, realizedGainCents };
    }
  }
}
