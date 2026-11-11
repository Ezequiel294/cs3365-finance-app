import type { FxRate } from '@finance/shared';
import type { ParameterStore } from '../repositories/parameter-store';
import type { FxRateProvider } from './fx-service';
import { addDays } from './period-calculator';

export type FetchFn = typeof fetch;

interface BccrConfig {
  endpoint: string;
  indicator: string;
  token: string;
}

/**
 * BCCR SDDE exchange-rate client. Reads `endpoint`, `indicator`, and `token`
 * from Parameter Store once per Lambda container. The token is sent only as a
 * bearer header and is never logged.
 */
export class BccrRateProvider implements FxRateProvider {
  private config: Promise<BccrConfig> | null = null;

  constructor(
    private readonly parameters: ParameterStore,
    private readonly prefix: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private loadConfig(): Promise<BccrConfig> {
    if (!this.config) {
      this.config = this.parameters.getParameters(this.prefix, ['endpoint', 'indicator', 'token']).then((map) => {
        const endpoint = map.get('endpoint');
        const indicator = map.get('indicator');
        const token = map.get('token');
        if (!endpoint || !indicator || !token) throw new Error('BCCR parameters are missing');
        return { endpoint, indicator, token };
      });
      this.config.catch(() => {
        this.config = null;
      });
    }
    return this.config;
  }

  async rateFor(date: string): Promise<FxRate | null> {
    const cfg = await this.loadConfig();
    const sameDay = await this.fetchSeries(cfg, date, date);
    const exact = sameDay.find((r) => r.rateDate === date);
    if (exact) return { ...exact, date };
    // Weekend or holiday: ask for the 7 days before and take the latest earlier rate.
    const earlier = (await this.fetchSeries(cfg, addDays(date, -7), addDays(date, -1)))
      .filter((r) => r.rateDate < date)
      .sort((a, b) => (a.rateDate < b.rateDate ? 1 : -1));
    return earlier[0] ? { ...earlier[0], date } : null;
  }

  private async fetchSeries(cfg: BccrConfig, from: string, to: string): Promise<FxRate[]> {
    const res = await this.fetchFn(this.buildUrl(cfg, from, to), {
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status !== 200) {
      console.warn(JSON.stringify({ msg: 'BCCR non-200', status: res.status }));
      return [];
    }
    return this.parseSeries(await res.json());
  }

  /** `{endpoint}/{indicator}/series?fechaInicio=yyyy/mm/dd&fechaFin=yyyy/mm/dd&idioma=ES`. */
  buildUrl(cfg: Pick<BccrConfig, 'endpoint' | 'indicator'>, fromDate: string, toDate: string): string {
    const query = new URLSearchParams({
      fechaInicio: fromDate.replace(/-/g, '/'),
      fechaFin: toDate.replace(/-/g, '/'),
      idioma: 'ES',
    });
    return `${cfg.endpoint.replace(/\/$/, '')}/${encodeURIComponent(cfg.indicator)}/series?${query.toString()}`;
  }

  /** Reads `datos[0].series[]` of `{ fecha, valorDatoPorPeriodo }`. */
  parseSeries(json: unknown): FxRate[] {
    const series = (json as { datos?: { series?: unknown[] }[] })?.datos?.[0]?.series;
    if (!Array.isArray(series)) return [];
    const rates: FxRate[] = [];
    for (const entry of series as { fecha?: unknown; valorDatoPorPeriodo?: unknown }[]) {
      const rateDate = parseFecha(entry?.fecha);
      const rate = Number(entry?.valorDatoPorPeriodo);
      if (!rateDate || !Number.isFinite(rate) || rate <= 0) continue;
      rates.push({ date: rateDate, rate, rateDate, source: 'BCCR' });
    }
    return rates;
  }
}

/** Accepts `yyyy-mm-dd`, `yyyy/mm/dd`, ISO timestamps, or `dd/mm/yyyy`. */
function parseFecha(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(value);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
