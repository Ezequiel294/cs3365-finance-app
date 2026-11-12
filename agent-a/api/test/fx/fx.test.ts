import { describe, expect, it, vi } from 'vitest';
import type { FxRate } from '../../../shared/types';
import { BccrRateProvider } from '../../src/fx/bccr-rate-provider';
import { FxService } from '../../src/fx/fx-service';
import { FxUnavailableError } from '../../src/http/errors';
import { jsonResponse } from '../helpers';

// A placeholder only: the real token lives in SSM and is never read by tests.
const PARAMS = { getParameters: async () => new Map([['endpoint', 'https://bccr.example/api/indicadoresEconomicos'], ['indicator', '318'], ['token', 'test-token']]) };

function series(rows: Array<[string, number]>) {
  return { datos: [{ series: rows.map(([fecha, valorDatoPorPeriodo]) => ({ fecha, valorDatoPorPeriodo })) }] };
}

describe('BccrRateProvider (05-S02)', () => {
  it('builds the series URL with URLSearchParams and sends the bearer token', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, series([['2026-10-14', 510.95]])));
    const p = new BccrRateProvider(PARAMS, '/FinanceApp/bccr/', fetchFn as never);
    const rate = await p.rateFor('2026-10-14');
    expect(rate).toEqual({ date: '2026-10-14', rate: 510.95, rateDate: '2026-10-14', source: 'BCCR' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://bccr.example/api/indicadoresEconomicos/318/series?fechaInicio=2026%2F10%2F14&fechaFin=2026%2F10%2F14&idioma=ES',
    );
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('on a weekend asks for the 7 days before and returns the latest earlier rate', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, series([])))
      .mockResolvedValueOnce(jsonResponse(200, series([['2026/10/08', 511.1], ['2026/10/09', 512.2]])));
    const p = new BccrRateProvider(PARAMS, '/FinanceApp/bccr', fetchFn as never);
    expect(await p.rateFor('2026-10-11')).toMatchObject({ date: '2026-10-11', rate: 512.2, rateDate: '2026-10-09' });
    expect(String(fetchFn.mock.calls[1]![0])).toContain('fechaInicio=2026%2F10%2F04');
  });

  it('a non-200 response means no rate', async () => {
    const p = new BccrRateProvider(PARAMS, '/FinanceApp/bccr', (async () => jsonResponse(401, {})) as never);
    expect(await p.rateFor('2026-10-14')).toBeNull();
  });

  it('reads endpoint, indicator, and token once per container', async () => {
    const getParameters = vi.fn(PARAMS.getParameters);
    const p = new BccrRateProvider({ getParameters }, '/FinanceApp/bccr', (async () => jsonResponse(200, series([['2026-10-14', 500]]))) as never);
    await p.rateFor('2026-10-14');
    await p.rateFor('2026-10-14');
    expect(getParameters).toHaveBeenCalledTimes(1);
    expect(getParameters).toHaveBeenCalledWith('/FinanceApp/bccr', ['endpoint', 'indicator', 'token']);
  });
});

describe('FxService', () => {
  const cache = () => {
    const store = new Map<string, FxRate>();
    return {
      store,
      getFxRate: async (d: string) => store.get(d) ?? null,
      putFxRate: async (r: FxRate) => void store.set(r.date, r),
    };
  };

  it('USD is unchanged at rate 1', async () => {
    const fx = new FxService({ rateFor: async () => null }, cache());
    expect(await fx.toUsd(1234, 'USD', '2026-10-14')).toEqual({ amountUsdCents: 1234, fxRate: 1, fxDate: '2026-10-14' });
  });

  it('CRC converts at the BCCR rate with exact rounding and caches the rate', async () => {
    const c = cache();
    const rateFor = vi.fn(async (d: string) => ({ date: d, rate: 510.95, rateDate: d, source: 'BCCR' }));
    const fx = new FxService({ rateFor }, c);
    expect(await fx.toUsd(1400000, 'CRC', '2026-10-14')).toEqual({ amountUsdCents: 2740, fxRate: 510.95, fxDate: '2026-10-14' });
    await fx.toUsd(200000, 'CRC', '2026-10-14');
    expect(rateFor).toHaveBeenCalledTimes(1);
    expect(c.store.get('2026-10-14')?.rate).toBe(510.95);
  });

  it('uses the rate date of the latest earlier rate', async () => {
    const fx = new FxService({ rateFor: async (d) => ({ date: d, rate: 500, rateDate: '2026-10-09', source: 'BCCR' }) }, cache());
    expect((await fx.toUsd(100000, 'CRC', '2026-10-11')).fxDate).toBe('2026-10-09');
  });

  it('BCCR unreachable and nothing cached: FxUnavailableError, no guessed rate', async () => {
    const fx = new FxService({ rateFor: async () => { throw new TypeError('fetch failed'); } }, cache());
    await expect(fx.toUsd(100, 'CRC', '2026-10-14')).rejects.toBeInstanceOf(FxUnavailableError);
  });

  it('convert rounds half to even', () => {
    const fx = new FxService({ rateFor: async () => null }, cache());
    expect(fx.convert(250, 100)).toBe(2);
    expect(fx.convert(350, 100)).toBe(4);
  });
});
