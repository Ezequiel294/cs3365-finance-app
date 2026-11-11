import {
  divRoundHalfEven,
  numberToDecimalString,
  parseDecimal,
  type Currency,
  type FxRate,
  type UsdConversion,
} from '@finance/shared';
import type { Clock } from '../clock';
import { FxUnavailableError } from '../errors';
import type { AggregateRepository } from '../repositories/aggregate-repository';

export interface FxRateProvider {
  /** The colones-per-dollar rate for `date`, or the latest earlier one. Null when none is available. */
  rateFor(date: string): Promise<FxRate | null>;
}

const RATE_SCALE = 8;

/** Converts amounts to USD at the BCCR rate of the transaction date, caching each date's rate. */
export class FxService {
  constructor(
    private readonly provider: FxRateProvider,
    private readonly aggregates: AggregateRepository,
    private readonly clock: Clock,
  ) {}

  async toUsd(amountMinor: number, currency: Currency, localDate: string): Promise<UsdConversion> {
    if (currency === 'USD') return { amountUsdCents: amountMinor, fxRate: 1, fxDate: localDate };
    if (currency !== 'CRC') throw new FxUnavailableError(`No exchange rate for ${currency}`);

    let rate = await this.aggregates.getFxRate(localDate).catch(() => undefined);
    if (!rate) {
      let fetched: FxRate | null = null;
      try {
        fetched = await this.provider.rateFor(localDate);
      } catch (err) {
        console.warn(JSON.stringify({ msg: 'BCCR request failed', error: (err as Error).name }));
      }
      if (!fetched) throw new FxUnavailableError();
      rate = { ...fetched, date: localDate };
      // A date that is today or later and got an earlier day's rate is not cached,
      // so the real rate is used once BCCR publishes it.
      const today = this.clock.today('America/Costa_Rica');
      if (rate.rateDate === localDate || localDate < today) {
        await this.aggregates.putFxRate(rate).catch(() => undefined);
      }
    }
    return { amountUsdCents: this.convert(amountMinor, rate.rate), fxRate: rate.rate, fxDate: rate.rateDate };
  }

  /** `amountMinor ÷ rate`, exact integer arithmetic, half-to-even to cents. */
  private convert(amountMinor: number, rate: number): number {
    const scaledRate = parseDecimal(numberToDecimalString(rate), RATE_SCALE);
    if (scaledRate <= 0n) throw new FxUnavailableError('Invalid exchange rate');
    return Number(divRoundHalfEven(BigInt(amountMinor) * 10n ** BigInt(RATE_SCALE), scaledRate));
  }
}
