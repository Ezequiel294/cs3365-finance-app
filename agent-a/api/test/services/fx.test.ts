import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '../../src/clock';
import { FxUnavailableError } from '../../src/errors';
import { ParameterStore } from '../../src/repositories/parameter-store';
import { BccrRateProvider } from '../../src/services/bccr-rate-provider';
import { FxService } from '../../src/services/fx-service';

const ENDPOINT = 'https://bccr.example/indicadoresEconomicos';

function ssm() {
  const client = new SSMClient({ region: 'us-east-2' });
  const mock = mockClient(client);
  mock.on(GetParametersCommand).resolves({
    Parameters: [
      { Name: '/FinanceApp/bccr/endpoint', Value: ENDPOINT },
      { Name: '/FinanceApp/bccr/indicator', Value: '318' },
      { Name: '/FinanceApp/bccr/token', Value: 'test-token-not-real' },
    ],
  });
  return { store: new ParameterStore(client), mock };
}

const series = (entries: [string, number][]) =>
  new Response(JSON.stringify({ datos: [{ series: entries.map(([fecha, valorDatoPorPeriodo]) => ({ fecha, valorDatoPorPeriodo })) }] }), { status: 200 });

describe('BccrRateProvider', () => {
  it('builds the series URL, sends the bearer header, and reads datos[0].series', async () => {
    const { store, mock } = ssm();
    const fetchFn = vi.fn(async () => series([['2026-10-14', 510.95]]));
    const provider = new BccrRateProvider(store, '/FinanceApp/bccr', fetchFn as never);
    expect(await provider.rateFor('2026-10-14')).toEqual({ date: '2026-10-14', rate: 510.95, rateDate: '2026-10-14', source: 'BCCR' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ENDPOINT}/318/series?fechaInicio=2026%2F10%2F14&fechaFin=2026%2F10%2F14&idioma=ES`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token-not-real');
    expect(mock.commandCalls(GetParametersCommand)[0].args[0].input).toMatchObject({ WithDecryption: true });
  });

  it('reads the parameters once per container', async () => {
    const { store, mock } = ssm();
    const provider = new BccrRateProvider(store, '/FinanceApp/bccr', (async () => series([['2026-10-14', 510]])) as never);
    await provider.rateFor('2026-10-14');
    await provider.rateFor('2026-10-14');
    expect(mock.commandCalls(GetParametersCommand)).toHaveLength(1);
  });

  it('falls back to the latest earlier rate in the 7 days before a weekend or holiday', async () => {
    const { store } = ssm();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(series([]))
      .mockResolvedValueOnce(series([['2026/10/09', 508.1], ['2026/10/08', 507.5]]));
    const provider = new BccrRateProvider(store, '/FinanceApp/bccr', fetchFn as never);
    expect(await provider.rateFor('2026-10-11')).toMatchObject({ date: '2026-10-11', rate: 508.1, rateDate: '2026-10-09' });
    expect(fetchFn.mock.calls[1][0]).toContain('fechaInicio=2026%2F10%2F04&fechaFin=2026%2F10%2F10');
  });

  it('treats a non-200 or empty series as no rate', async () => {
    const { store } = ssm();
    const provider = new BccrRateProvider(store, '/FinanceApp/bccr', (async () => new Response('nope', { status: 401 })) as never);
    expect(await provider.rateFor('2026-10-14')).toBeNull();
  });
});

describe('FxService', () => {
  const clock = new FixedClock(new Date('2026-10-20T12:00:00Z'));
  const fakeAgg = () => {
    const rates = new Map<string, unknown>();
    return {
      rates,
      getFxRate: async (d: string) => rates.get(d) as never,
      putFxRate: async (r: { date: string }) => void rates.set(r.date, r),
    };
  };

  it('returns USD unchanged with rate 1', async () => {
    const fx = new FxService({ rateFor: async () => null }, fakeAgg() as never, clock);
    expect(await fx.toUsd(1234, 'USD', '2026-10-14')).toEqual({ amountUsdCents: 1234, fxRate: 1, fxDate: '2026-10-14' });
  });

  it('converts CRC with half-even rounding and caches the rate per date', async () => {
    const agg = fakeAgg();
    const rateFor = vi.fn(async (d: string) => ({ date: d, rate: 510.95, rateDate: d, source: 'BCCR' }));
    const fx = new FxService({ rateFor }, agg as never, clock);
    expect(await fx.toUsd(1400000, 'CRC', '2026-10-14')).toEqual({ amountUsdCents: 2740, fxRate: 510.95, fxDate: '2026-10-14' });
    await fx.toUsd(5000, 'CRC', '2026-10-14');
    expect(rateFor).toHaveBeenCalledTimes(1);
    // 250 colones at 500 = 0.5 cents → rounds to even (0); 750 → 1.5 → 2
    const fx500 = new FxService({ rateFor: async (d) => ({ date: d, rate: 500, rateDate: d, source: 'BCCR' }) }, fakeAgg() as never, clock);
    expect((await fx500.toUsd(25000, 'CRC', '2026-10-01')).amountUsdCents).toBe(50);
    expect((await fx500.toUsd(250, 'CRC', '2026-10-01')).amountUsdCents).toBe(0);
    expect((await fx500.toUsd(750, 'CRC', '2026-10-01')).amountUsdCents).toBe(2);
  });

  it('throws FxUnavailableError when BCCR fails and nothing is cached', async () => {
    const fx = new FxService({ rateFor: async () => { throw new Error('ECONNRESET'); } }, fakeAgg() as never, clock);
    await expect(fx.toUsd(100, 'CRC', '2026-10-14')).rejects.toBeInstanceOf(FxUnavailableError);
  });

  it('does not cache an earlier day rate for today, so the real one is used once published', async () => {
    const agg = fakeAgg();
    const fx = new FxService({ rateFor: async (d) => ({ date: d, rate: 505, rateDate: '2026-10-19', source: 'BCCR' }) }, agg as never, clock);
    await fx.toUsd(100, 'CRC', '2026-10-20');
    expect(agg.rates.has('2026-10-20')).toBe(false);
    await fx.toUsd(100, 'CRC', '2026-10-18');
    expect(agg.rates.has('2026-10-18')).toBe(true);
  });
});
