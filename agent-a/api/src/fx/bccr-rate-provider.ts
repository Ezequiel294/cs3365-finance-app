import type { FxRate } from "@finance/shared";
import type { ParameterStore } from "../repositories/parameter-store";
import { addDays } from "../dates";
import type { FxRateProvider } from "./fx-rate-provider";

type FetchFn = typeof fetch;

interface BccrConfig {
  endpoint: string;
  indicator: string;
  token: string;
}

const REQUEST_TIMEOUT_MS = 6000;

/**
 * Reads the CRC/USD rate from the BCCR SDDE API. The endpoint, indicator code, and bearer token
 * come from Parameter Store (`/FinanceApp/bccr/*`) once per Lambda container. The token is only
 * ever placed in the Authorization header; it is never logged or returned.
 */
export class BccrRateProvider implements FxRateProvider {
  private config?: Promise<BccrConfig>;

  constructor(
    private readonly parameters: ParameterStore,
    private readonly prefix: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async rateFor(date: string): Promise<FxRate | undefined> {
    const sameDay = await this.fetchSeries(date, date);
    const exact = latestOnOrBefore(sameDay, date);
    if (exact) return { date, rate: exact.rate, rateDate: exact.rateDate, source: "BCCR" };
    // Weekend or holiday: use the latest earlier rate from the 7 days before.
    const before = await this.fetchSeries(addDays(date, -7), addDays(date, -1));
    const earlier = latestOnOrBefore(before, date);
    if (!earlier) return undefined;
    return { date, rate: earlier.rate, rateDate: earlier.rateDate, source: "BCCR" };
  }

  /** `{endpoint}/{indicator}/series?fechaInicio=yyyy/mm/dd&fechaFin=yyyy/mm/dd&idioma=ES` */
  buildUrl(endpoint: string, indicator: string, fromDate: string, toDate: string): string {
    const query = new URLSearchParams({
      fechaInicio: fromDate.replaceAll("-", "/"),
      fechaFin: toDate.replaceAll("-", "/"),
      idioma: "ES",
    });
    return `${endpoint.replace(/\/+$/, "")}/${encodeURIComponent(indicator)}/series?${query.toString()}`;
  }

  /** Reads `datos[0].series`, an array of `{ fecha, valorDatoPorPeriodo }`. */
  parseSeries(json: unknown): { rate: number; rateDate: string }[] {
    const datos = (json as { datos?: unknown })?.datos;
    if (!Array.isArray(datos) || datos.length === 0) return [];
    const series = (datos[0] as { series?: unknown })?.series;
    if (!Array.isArray(series)) return [];
    const out: { rate: number; rateDate: string }[] = [];
    for (const point of series) {
      const p = point as { fecha?: unknown; valorDatoPorPeriodo?: unknown };
      const rateDate = parseBccrDate(p.fecha);
      const rate = typeof p.valorDatoPorPeriodo === "number" ? p.valorDatoPorPeriodo : Number(String(p.valorDatoPorPeriodo ?? "").replace(",", "."));
      if (rateDate && Number.isFinite(rate) && rate > 0) out.push({ rate, rateDate });
    }
    return out.sort((a, b) => a.rateDate.localeCompare(b.rateDate));
  }

  private async fetchSeries(from: string, to: string): Promise<{ rate: number; rateDate: string }[]> {
    const cfg = await this.loadConfig();
    const response = await this.fetchFn(this.buildUrl(cfg.endpoint, cfg.indicator, from, to), {
      method: "GET",
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status !== 200) return [];
    return this.parseSeries(await response.json());
  }

  private loadConfig(): Promise<BccrConfig> {
    if (!this.config) {
      this.config = this.parameters
        .getParameters(this.prefix, ["endpoint", "indicator", "token"])
        .then((values) => ({
          endpoint: values.get("endpoint") ?? "",
          indicator: values.get("indicator") ?? "",
          token: values.get("token") ?? "",
        }))
        .catch((error) => {
          this.config = undefined; // retry on the next call instead of caching the failure
          throw error;
        });
    }
    return this.config;
  }
}

function latestOnOrBefore(series: { rate: number; rateDate: string }[], date: string) {
  const eligible = series.filter((p) => p.rateDate <= date);
  return eligible.length ? eligible[eligible.length - 1] : undefined;
}

/** Accepts `2026-10-14T00:00:00`, `2026/10/14`, or `14/10/2026`. */
export function parseBccrDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(value);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return undefined;
}
