import type { FxRate } from "@finance/shared";

/** Source of the official CRC per USD rate for a date. Returns undefined when it has no rate. */
export interface FxRateProvider {
  rateFor(date: string): Promise<FxRate | undefined>;
}
