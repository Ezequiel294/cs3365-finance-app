import { divRoundHalfEven } from './money';
import type { AssetClass, Broker, Fee, FeeSchedule, FeeSuggestion, InvestmentType } from './types';

export const ZERO_FEE: Fee = { flatCents: 0, percentBps: 0 };

export function emptyFeeSchedule(): FeeSchedule {
  return {
    deposit: { ...ZERO_FEE },
    withdrawal: { ...ZERO_FEE },
    buy: { security: { ...ZERO_FEE }, crypto: { ...ZERO_FEE } },
    sell: { security: { ...ZERO_FEE }, crypto: { ...ZERO_FEE } },
  };
}

/** `Broker.feeFor(type, assetClass)`: picks the fee entry for an operation. */
export function feeFor(fees: FeeSchedule, type: InvestmentType, assetClass?: AssetClass | null): Fee {
  switch (type) {
    case 'DEPOSIT':
      return fees.deposit ?? ZERO_FEE;
    case 'WITHDRAWAL':
      return fees.withdrawal ?? ZERO_FEE;
    case 'BUY':
      return (assetClass === 'CRYPTO' ? fees.buy?.crypto : fees.buy?.security) ?? ZERO_FEE;
    case 'SELL':
      return (assetClass === 'CRYPTO' ? fees.sell?.crypto : fees.sell?.security) ?? ZERO_FEE;
  }
}

function usd(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  return `${negative ? '-' : ''}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

function percent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = String(bps % 100).padStart(2, '0').replace(/0+$/, '');
  return `${whole}${frac ? '.' + frac : ''}%`;
}

const OPERATION_LABEL: Record<InvestmentType, string> = {
  DEPOSIT: 'deposit fee',
  WITHDRAWAL: 'withdrawal fee',
  BUY: 'buy fee',
  SELL: 'sell fee',
};

/**
 * The shared fee arithmetic (class diagram section 10a). Used by the browser for
 * the live suggestion and by the API when `commissionCents` is omitted.
 */
export const FeeCalculator = {
  /** `flatCents + roundHalfEven(base × percentBps ÷ 10000)` in integer arithmetic. */
  fee(fee: Fee, baseCents: number): number {
    const pct = divRoundHalfEven(BigInt(baseCents) * BigInt(fee.percentBps), 10000n);
    return fee.flatCents + Number(pct);
  },

  /** The amount to send so that `netCents` arrives: `roundHalfEven((net + flat) × 10000 ÷ (10000 − bps))`. */
  grossUp(fee: Fee, netCents: number): number {
    const gross = divRoundHalfEven(BigInt(netCents + fee.flatCents) * 10000n, BigInt(10000 - fee.percentBps));
    return Number(gross);
  },

  /** Sentence explaining a fee, e.g. "1.55% of $300.00 = $4.65" or "$0.15 flat". */
  explain(fee: Fee, baseCents: number): string {
    const total = FeeCalculator.fee(fee, baseCents);
    if (fee.percentBps === 0 && fee.flatCents === 0) return 'no fee';
    if (fee.percentBps === 0) return `${usd(fee.flatCents)} flat`;
    const pctPart = `${percent(fee.percentBps)} of ${usd(baseCents)}`;
    if (fee.flatCents === 0) return `${pctPart} = ${usd(total)}`;
    return `${usd(fee.flatCents)} flat + ${pctPart} = ${usd(total)}`;
  },

  /** Picks the broker's fee, applies it, and explains it. */
  suggest(
    broker: Pick<Broker, 'name' | 'fees'>,
    type: InvestmentType,
    assetClass: AssetClass | null | undefined,
    baseCents: number,
  ): FeeSuggestion {
    const fee = feeFor(broker.fees, type, assetClass);
    const commissionCents = FeeCalculator.fee(fee, baseCents);
    let label = `${broker.name} ${OPERATION_LABEL[type]}`;
    if (type === 'BUY' || type === 'SELL') {
      label += assetClass === 'CRYPTO' ? ', crypto' : ', stocks and ETFs';
    }
    const netCents = type === 'BUY' ? baseCents + commissionCents : baseCents - commissionCents;
    return { commissionCents, netCents, explanation: `${label}: ${FeeCalculator.explain(fee, baseCents)}` };
  },
};

export { usd as formatUsdCents };
