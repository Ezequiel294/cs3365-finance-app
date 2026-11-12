import { addDays } from '../../../shared/dates';
import type { FxRate } from '../../../shared/types';
import type { ParameterStore } from '../repositories/parameter-store';
import type { FxRateProvider } from './fx-service';

type FetchFn = typeof fetch;

interface BccrConfig {
  endpoint: string;
  indicator: string;
  token: string;
}

/**
 * BCCR exchange-rate client. Endpoint, indicator, and token are read from SSM
 * (/FinanceApp/bccr/*) once per Lambda container. The token is never logged.
 */
export class BccrRateProvider implements FxRateProvider {
  private config: Promise<BccrConfig> | null = null;

  constructor(
    private readonly params: Pick<ParameterStore, 'getParameters'>,
    private readonly prefix: string,
    private readonly fetchFn: FetchFn = fetch,
    private readonly timeoutMs = 5000,
  ) {}

  private loadConfig(): Promise<BccrConfig> {
    if (!this.config) {
      this.config = this.params.getParameters(this.prefix, ['endpoint', 'indicator', 'token']).then((m) => {
        const endpoint = m.get('endpoint');
        const indicator = m.get('indicator');
        const token = m.get('token');
        if (!endpoint || !indicator || !token) throw new Error('BCCR parameters are missing');
        return { endpoint: endpoint.replace(/\/+$/, ''), indicator, token };
      });
      this.config.catch(() => {
        this.config = null;
      });
    }
    return this.config;
  }

  async rateFor(date: string): Promise<FxRate | null> {
    const cfg = await this.loadConfig();
    const exact = await this.fetchSeries(cfg, date, date);
    const sameDay = exact.filter((r) => r.rateDate === date);
    if (sameDay.length) return { ...sameDay[0]!, date };
    // Weekend or holiday: ask for the 7 days before and take the latest earlier rate.
    const earlier = await this.fetchSeries(cfg, addDays(date, -7), date);
    const best = earlier
      .filter((r) => r.rateDate <= date)
      .sort((a, b) => b.rateDate.localeCompare(a.rateDate))[0];
    return best ? { ...best, date } : null;
  }

  buildUrl(endpoint: string, indicator: string, fromDate: string, toDate: string): string {
    const q = new URLSearchParams({
      fechaInicio: fromDate.replace(/-/g, '/'),
      fechaFin: toDate.replace(/-/g, '/'),
      idioma: 'ES',
    });
    return `${endpoint}/${encodeURIComponent(indicator)}/series?${q.toString()}`;
  }

  private async fetchSeries(cfg: BccrConfig, from: string, to: string): Promise<FxRate[]> {
    const url = this.buildUrl(cfg.endpoint, cfg.indicator, from, to);
    const res = await this.fetchFn(url, {
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status !== 200) {
      console.warn(JSON.stringify({ msg: 'bccr non-200', status: res.status }));
      return [];
    }
    return this.parseSeries(await res.json());
  }

  /** Reads datos[0].series: [{ fecha, valorDatoPorPeriodo }]. */
  parseSeries(json: unknown): FxRate[] {
    const datos = (json as { datos?: Array<{ series?: unknown[] }> })?.datos;
    const series = Array.isArray(datos) && datos[0] && Array.isArray(datos[0].series) ? datos[0].series : [];
    const out: FxRate[] = [];
    for (const s of series as Array<Record<string, unknown>>) {
      const rateDate = normalizeDate(s?.fecha);
      const value = Number(String(s?.valorDatoPorPeriodo ?? '').replace(',', '.'));
      if (rateDate && Number.isFinite(value) && value > 0) {
        out.push({ date: rateDate, rate: value, rateDate, source: 'BCCR' });
      }
    }
    return out;
  }
}

/** Accepts 2026-10-14, 2026/10/14, 2026-10-14T00:00:00, and 14/10/2026. */
function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  let m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(v);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
