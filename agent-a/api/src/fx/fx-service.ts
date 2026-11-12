import { decimalToScaled, divRoundHalfEven } from '../../../shared/money';
import type { Currency, FxRate, UsdConversion } from '../../../shared/types';
import { FxUnavailableError } from '../http/errors';
import type { AggregateRepository } from '../repositories/aggregate-repository';

export interface FxRateProvider {
  /** The CRC-per-USD rate for the date, or the latest earlier one; null when none. */
  rateFor(date: string): Promise<FxRate | null>;
}

/** Converts original amounts to USD at the BCCR rate of the transaction date. */
export class FxService {
  constructor(
    private readonly provider: FxRateProvider,
    private readonly aggregates: Pick<AggregateRepository, 'getFxRate' | 'putFxRate'>,
  ) {}

  async toUsd(amountMinor: number, currency: Currency, localDate: string): Promise<UsdConversion> {
    if (currency === 'USD') return { amountUsdCents: amountMinor, fxRate: 1, fxDate: localDate };
    let rate: FxRate | null = null;
    try {
      rate = await this.aggregates.getFxRate(localDate);
      if (!rate) {
        rate = await this.provider.rateFor(localDate);
        if (rate) await this.aggregates.putFxRate({ ...rate, date: localDate });
      }
    } catch (e) {
      console.warn(JSON.stringify({ msg: 'fx lookup failed', date: localDate, error: (e as Error).name }));
      rate = null;
    }
    if (!rate || !(rate.rate > 0)) throw new FxUnavailableError(localDate);
    return { amountUsdCents: this.convert(amountMinor, rate.rate), fxRate: rate.rate, fxDate: rate.rateDate };
  }

  /**
   * CRC minor units ÷ (CRC per USD) = USD cents. Exact integer arithmetic with the rate
   * scaled to 10^6, rounded half to even.
   */
  convert(amountMinor: number, rate: number): number {
    const scale = 6;
    const rateScaled = decimalToScaled(String(rate), scale);
    return Number(divRoundHalfEven(BigInt(amountMinor) * 10n ** BigInt(scale), rateScaled));
  }
}
