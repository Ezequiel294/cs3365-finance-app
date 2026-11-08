import type { Currency, FxRate, UsdConversion } from "@finance/shared";
import { FxUnavailableError } from "../http/errors";
import type { AggregateRepository } from "../repositories/aggregate-repository";
import type { FxRateProvider } from "./fx-rate-provider";

const RATE_SCALE_DIGITS = 8;

/**
 * Converts amounts to USD cents. USD is returned unchanged at rate 1.0. CRC uses the BCCR rate of
 * the transaction date, cached as `FX#USD-CRC#<date>` so BCCR is called at most once per date.
 * When no rate can be found the conversion fails with `FxUnavailableError` instead of guessing.
 */
export class FxService {
  private readonly memory = new Map<string, FxRate>();

  constructor(
    private readonly aggregates: AggregateRepository,
    private readonly provider: FxRateProvider,
  ) {}

  async toUsd(amountMinor: number, currency: Currency, localDate: string): Promise<UsdConversion> {
    if (currency === "USD") return { amountUsdCents: amountMinor, fxRate: 1, fxDate: localDate };
    const rate = await this.rateFor(localDate);
    return { amountUsdCents: this.convert(amountMinor, rate.rate), fxRate: rate.rate, fxDate: rate.rateDate };
  }

  private async rateFor(date: string): Promise<FxRate> {
    const remembered = this.memory.get(date);
    if (remembered) return remembered;
    let rate: FxRate | undefined;
    try {
      rate = await this.aggregates.getFxRate(date);
      if (!rate) {
        rate = await this.provider.rateFor(date);
        if (rate) await this.aggregates.putFxRate(rate);
      }
    } catch (error) {
      console.warn(JSON.stringify({ msg: "fx rate lookup failed", date, error: (error as Error)?.name }));
      rate = undefined;
    }
    if (!rate) throw new FxUnavailableError();
    this.memory.set(date, rate);
    return rate;
  }

  /**
   * CRC minor units → USD cents: `amountMinor / rate`, where rate is colones per dollar. Exact
   * integer arithmetic, rounded half-to-even.
   */
  convert(amountMinor: number, rate: number): number {
    if (!(rate > 0)) throw new Error("rate must be positive");
    const scale = 10n ** BigInt(RATE_SCALE_DIGITS);
    const rateScaled = decimalToScaled(rate, RATE_SCALE_DIGITS);
    const numerator = BigInt(amountMinor) * scale;
    let quotient = numerator / rateScaled;
    const remainder = numerator % rateScaled;
    const twice = remainder * 2n;
    if (twice > rateScaled || (twice === rateScaled && quotient % 2n === 1n)) quotient += 1n;
    return Number(quotient);
  }
}

/** `510.95` with 8 digits → 51095000000n, read from the decimal text so no float error enters. */
export function decimalToScaled(value: number, digits: number): bigint {
  const text = value.toFixed(digits);
  const [whole, frac = ""] = text.split(".");
  return BigInt(whole + frac.padEnd(digits, "0").slice(0, digits));
}
