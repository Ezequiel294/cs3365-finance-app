import { divRoundHalfEven, formatBps, formatMoney } from './money';
import type { AssetClass, Broker, Fee, InvestmentType } from './types';

export interface FeeSuggestion {
  commissionCents: number;
  netCents: number;
  explanation: string;
}

const ZERO_FEE: Fee = { flatCents: 0, percentBps: 0 };

/** Broker.feeFor(type, assetClass): which fee of the schedule applies. */
export function feeFor(broker: Pick<Broker, 'fees'>, type: InvestmentType, assetClass?: AssetClass | null): Fee {
  const f = broker.fees;
  switch (type) {
    case 'DEPOSIT':
      return f.deposit ?? ZERO_FEE;
    case 'WITHDRAWAL':
      return f.withdrawal ?? ZERO_FEE;
    case 'BUY':
      return (assetClass === 'CRYPTO' ? f.buy?.crypto : f.buy?.security) ?? ZERO_FEE;
    case 'SELL':
      return (assetClass === 'CRYPTO' ? f.sell?.crypto : f.sell?.security) ?? ZERO_FEE;
  }
}

function operationLabel(type: InvestmentType, assetClass?: AssetClass | null): string {
  switch (type) {
    case 'DEPOSIT':
      return 'deposit fee';
    case 'WITHDRAWAL':
      return 'withdrawal fee';
    case 'BUY':
      return `buy fee, ${assetClass === 'CRYPTO' ? 'crypto' : 'stocks and ETFs'}`;
    case 'SELL':
      return `sell fee, ${assetClass === 'CRYPTO' ? 'crypto' : 'stocks and ETFs'}`;
  }
}

/**
 * Shared pure fee arithmetic (class diagram section 10a). The browser uses it for the live
 * suggestion and InvestmentService uses it when commissionCents is omitted, so both agree.
 */
export const FeeCalculator = {
  /** fee = flatCents + roundHalfEven(base × percentBps ÷ 10000). */
  fee(fee: Fee, baseCents: number): number {
    const pct = divRoundHalfEven(BigInt(baseCents) * BigInt(fee.percentBps), 10000n);
    return fee.flatCents + Number(pct);
  },

  /** Amount to send so that `net` arrives: roundHalfEven((net + flat) × 10000 ÷ (10000 − bps)). */
  grossUp(fee: Fee, netCents: number): number {
    if (fee.percentBps >= 10000) throw new Error('percentBps must be below 10000');
    return Number(
      divRoundHalfEven(BigInt(netCents + fee.flatCents) * 10000n, BigInt(10000 - fee.percentBps)),
    );
  },

  /** "1.55% of $300.00 = $4.65", "$0.15 flat", "$0.15 + 1% of $200.00 = $2.15", "No fee". */
  explain(fee: Fee, baseCents: number): string {
    const total = FeeCalculator.fee(fee, baseCents);
    if (fee.flatCents === 0 && fee.percentBps === 0) return 'no fee';
    if (fee.percentBps === 0) return `${formatMoney(fee.flatCents)} flat`;
    const pct = `${formatBps(fee.percentBps)} of ${formatMoney(baseCents)}`;
    if (fee.flatCents === 0) return `${pct} = ${formatMoney(total)}`;
    return `${formatMoney(fee.flatCents)} + ${pct} = ${formatMoney(total)}`;
  },

  /** Pick the broker's fee for the operation, apply it, and explain it. */
  suggest(
    broker: Pick<Broker, 'fees' | 'name'>,
    type: InvestmentType,
    assetClass: AssetClass | null | undefined,
    baseCents: number,
  ): FeeSuggestion {
    const fee = feeFor(broker, type, assetClass);
    const commissionCents = FeeCalculator.fee(fee, baseCents);
    const netCents =
      type === 'BUY' ? baseCents + commissionCents : baseCents - commissionCents;
    const explanation = `${broker.name} ${operationLabel(type, assetClass)}: ${FeeCalculator.explain(fee, baseCents)}`;
    return { commissionCents, netCents, explanation };
  },
};

export const EMPTY_FEE_SCHEDULE = {
  deposit: { flatCents: 0, percentBps: 0 },
  withdrawal: { flatCents: 0, percentBps: 0 },
  buy: { security: { flatCents: 0, percentBps: 0 }, crypto: { flatCents: 0, percentBps: 0 } },
  sell: { security: { flatCents: 0, percentBps: 0 }, crypto: { flatCents: 0, percentBps: 0 } },
};
