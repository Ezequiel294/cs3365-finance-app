import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BccrRateProvider, parseBccrDate } from "../src/fx/bccr-rate-provider";
import { FxService } from "../src/fx/fx-service";
import { FxUnavailableError } from "../src/http/errors";
import type { AggregateRepository } from "../src/repositories/aggregate-repository";
import { ParameterStore } from "../src/repositories/parameter-store";
import { FakeFxProvider } from "./support/harness";

function memoryAggregates() {
  const rates = new Map<string, unknown>();
  return {
    rates,
    repo: {
      getFxRate: vi.fn(async (date: string) => rates.get(date)),
      putFxRate: vi.fn(async (rate: { date: string }) => void rates.set(rate.date, rate)),
    } as unknown as AggregateRepository,
  };
}

describe("FxService", () => {
  it("returns USD unchanged at rate 1.0", async () => {
    const { repo } = memoryAggregates();
    const fx = new FxService(repo, new FakeFxProvider());
    expect(await fx.toUsd(1200, "USD", "2026-10-14")).toEqual({ amountUsdCents: 1200, fxRate: 1, fxDate: "2026-10-14" });
  });

  it("converts CRC at the date's rate and caches it so BCCR is asked once", async () => {
    const { repo, rates } = memoryAggregates();
    const provider = new FakeFxProvider({ "2026-10-14": 510.95 });
    const fx = new FxService(repo, provider);
    const first = await fx.toUsd(1_400_000, "CRC", "2026-10-14");
    expect(first).toEqual({ amountUsdCents: 2740, fxRate: 510.95, fxDate: "2026-10-14" });
    expect(rates.has("2026-10-14")).toBe(true);
    await new FxService(repo, provider).toUsd(500_000, "CRC", "2026-10-14");
    expect(provider.calls).toEqual(["2026-10-14"]);
  });

  it("refuses to convert when no rate can be found", async () => {
    const { repo } = memoryAggregates();
    const fx = new FxService(repo, new FakeFxProvider({}, null));
    await expect(fx.toUsd(100, "CRC", "2026-10-14")).rejects.toBeInstanceOf(FxUnavailableError);
  });

  it("rounds half to even with exact integer arithmetic", () => {
    const fx = new FxService(memoryAggregates().repo, new FakeFxProvider());
    expect(fx.convert(250, 100)).toBe(2); // 2.5 → 2
    expect(fx.convert(350, 100)).toBe(4); // 3.5 → 4
    expect(fx.convert(1_400_000, 510.95)).toBe(2740); // 2739.99...
    expect(fx.convert(1, 3)).toBe(0);
    expect(fx.convert(123_456_789, 512.37)).toBe(240_952); // 240952.41...
  });
});

describe("BccrRateProvider", () => {
  const ssm = mockClient(SSMClient);
  afterEach(() => ssm.reset());

  function provider(fetchFn: typeof fetch) {
    ssm.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: "/FinanceApp/bccr/endpoint", Value: "https://bccr.example.test/api/indicadoresEconomicos" },
        { Name: "/FinanceApp/bccr/indicator", Value: "318" },
        { Name: "/FinanceApp/bccr/token", Value: "fake-token-for-tests" },
      ],
    });
    const params = new ParameterStore(new SSMClient({ region: "us-east-2", credentials: { accessKeyId: "x", secretAccessKey: "y" } }));
    return new BccrRateProvider(params, "/FinanceApp/bccr", fetchFn);
  }

  const series = (points: { fecha: string; valorDatoPorPeriodo: number | string }[]) =>
    new Response(JSON.stringify({ datos: [{ codigoIndicador: 318, series: points }] }), { status: 200 });

  it("builds the SDDE URL with URLSearchParams and sends the bearer token", async () => {
    const fetchFn = vi.fn(async () => series([{ fecha: "2026-10-14T00:00:00", valorDatoPorPeriodo: 510.95 }]));
    const p = provider(fetchFn as unknown as typeof fetch);
    const rate = await p.rateFor("2026-10-14");
    expect(rate).toEqual({ date: "2026-10-14", rate: 510.95, rateDate: "2026-10-14", source: "BCCR" });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bccr.example.test/api/indicadoresEconomicos/318/series?fechaInicio=2026%2F10%2F14&fechaFin=2026%2F10%2F14&idioma=ES");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fake-token-for-tests");
    expect(ssm.commandCalls(GetParametersCommand)[0].args[0].input).toMatchObject({ WithDecryption: true });
  });

  it("falls back to the latest earlier rate in the 7 days before a weekend or holiday", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(series([]))
      .mockResolvedValueOnce(
        series([
          { fecha: "2026-10-09T00:00:00", valorDatoPorPeriodo: "509.10" },
          { fecha: "2026-10-10T00:00:00", valorDatoPorPeriodo: 510.2 },
        ]),
      );
    const rate = await provider(fetchFn as unknown as typeof fetch).rateFor("2026-10-11");
    expect(rate).toEqual({ date: "2026-10-11", rate: 510.2, rateDate: "2026-10-10", source: "BCCR" });
    expect(String(fetchFn.mock.calls[1][0])).toContain("fechaInicio=2026%2F10%2F04&fechaFin=2026%2F10%2F10");
  });

  it("treats a non-200 answer as no rate", async () => {
    const fetchFn = vi.fn(async () => new Response("denied", { status: 401 }));
    expect(await provider(fetchFn as unknown as typeof fetch).rateFor("2026-10-14")).toBeUndefined();
  });

  it("parses the date formats BCCR may use", () => {
    expect(parseBccrDate("2026-10-14T00:00:00")).toBe("2026-10-14");
    expect(parseBccrDate("14/10/2026")).toBe("2026-10-14");
    expect(parseBccrDate("2026/10/14")).toBe("2026-10-14");
    expect(parseBccrDate(42)).toBeUndefined();
  });
});
