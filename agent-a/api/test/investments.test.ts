import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import type { InvestmentTransaction } from "@finance/shared";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoldingCalculator, mulDivRound, sellCommission } from "../src/investments/holding-calculator";
import { HttpMarketPriceProvider } from "../src/investments/http-market-price-provider";
import { PriceUnavailableError } from "../src/investments/market-price-provider";
import { Keys } from "../src/keys";
import { ParameterStore } from "../src/repositories/parameter-store";
import { createHarness, TABLES, USER, type Harness } from "./support/harness";

const trade = (t: Partial<InvestmentTransaction>): InvestmentTransaction => ({
  id: "x",
  userId: USER,
  brokerId: "brk-schwab",
  type: "BUY",
  localDate: "2026-10-01",
  ticker: "VOO",
  commissionCents: 0,
  createdAt: "2026-10-01T00:00:00Z",
  version: 1,
  ...t,
});

describe("HoldingCalculator", () => {
  const calc = new HoldingCalculator();
  const empty = { brokerId: "brk-schwab", ticker: "VOO", quantityMicro: 0, costBasisCents: 0, realizedGainCents: 0, version: 0 };

  it("adds gross plus commission to the cost basis on a buy", () => {
    expect(calc.applyBuy(empty, trade({ quantityMicro: 3_215_000, grossCents: 145_000, commissionCents: 15 }))).toMatchObject({
      quantityMicro: 3_215_000,
      costBasisCents: 145_015,
    });
  });

  it("removes average cost on a sale and records the realized gain", () => {
    const h = { ...empty, quantityMicro: 4_000_000, costBasisCents: 200_000 };
    const r = calc.applySell(h, trade({ type: "SELL", quantityMicro: 1_000_000, grossCents: 60_000, commissionCents: 100 }));
    expect(r.costRemovedCents).toBe(50_000);
    expect(r.realizedGainCents).toBe(9_900);
    expect(r.holding).toMatchObject({ quantityMicro: 3_000_000, costBasisCents: 150_000, realizedGainCents: 9_900 });
  });

  it("rejects a sale larger than the holding", () => {
    expect(() => calc.applySell({ ...empty, quantityMicro: 1 }, trade({ type: "SELL", quantityMicro: 2, grossCents: 1 }))).toThrow(/fewer units/);
  });

  it("replays trades in date order", () => {
    const holding = calc.replay([
      trade({ id: "s", type: "SELL", localDate: "2026-10-05", quantityMicro: 1_000_000, grossCents: 30_000 }),
      trade({ id: "b", type: "BUY", localDate: "2026-10-01", quantityMicro: 2_000_000, grossCents: 40_000 }),
    ]);
    expect(holding).toMatchObject({ quantityMicro: 1_000_000, costBasisCents: 20_000, realizedGainCents: 10_000 });
  });

  it("computes cash changes and commissions", () => {
    expect(calc.cashDelta(trade({ type: "DEPOSIT", amountCents: 20_315, commissionCents: 315 }))).toBe(20_000);
    expect(calc.cashDelta(trade({ type: "BUY", grossCents: 19_975, commissionCents: 15 }))).toBe(-19_990);
    expect(sellCommission({ flatCents: 15, percentBps: 25 }, 161_240)).toBe(15 + 403);
    expect(mulDivRound(3_215_000, 50_150, 1_000_000)).toBe(161_232);
  });
});

describe("InvestmentService, BrokerService, ValuationService (07-S01 to 07-S05)", () => {
  let h: Harness;
  beforeEach(async () => {
    h = createHarness({ now: "2026-10-20T15:00:00Z" });
    await h.services.brokerService().update(USER, "brk-schwab", { name: "Schwab", flatCents: 15, percentBps: 0 }, 0);
  });
  afterEach(() => h.restore());

  const holding = () => h.dynamo.item(TABLES.AGGREGATES_TABLE, Keys.user(USER), Keys.holding("brk-schwab", "VOO"));
  const cash = () => h.dynamo.item(TABLES.AGGREGATES_TABLE, Keys.user(USER), Keys.cash("brk-schwab"));

  it("records a deposit and a buy with their commissions in one write each (07-S04)", async () => {
    const svc = h.services.investmentService();
    await svc.record(USER, { brokerId: "brk-schwab", type: "DEPOSIT", localDate: "2026-10-01", amountCents: 20_315, commissionCents: 315 });
    expect(cash()).toMatchObject({ balanceCents: 20_000 });
    const buy = await svc.record(USER, { brokerId: "brk-schwab", type: "BUY", localDate: "2026-10-02", ticker: "VOO", quantityMicro: 389_000, grossCents: 19_975, commissionCents: 15 });
    expect(buy.holding).toMatchObject({ quantityMicro: 389_000, costBasisCents: 19_990 });
    expect(cash()).toMatchObject({ balanceCents: 10 });
    expect(h.dynamo.item(TABLES.AGGREGATES_TABLE, Keys.user(USER), Keys.month("2026-10", "INV"))).toMatchObject({
      depositedCents: 20_315,
      boughtCents: 19_975,
      commissionsCents: 330,
    });
    expect(h.dynamo.items(TABLES.AGGREGATES_TABLE).some((i) => String(i.SK).startsWith("MONTH#2026-10#TOTAL"))).toBe(false);
  });

  it("rejects an unknown broker and a sale larger than the holding", async () => {
    const svc = h.services.investmentService();
    await expect(svc.record(USER, { brokerId: "nope", type: "DEPOSIT", localDate: "2026-10-01", amountCents: 1, commissionCents: 0 })).rejects.toMatchObject({ status: 400 });
    await svc.record(USER, { brokerId: "brk-schwab", type: "BUY", localDate: "2026-10-02", ticker: "VOO", quantityMicro: 1_000_000, grossCents: 50_000, commissionCents: 0 });
    await expect(
      svc.record(USER, { brokerId: "brk-schwab", type: "SELL", localDate: "2026-10-03", ticker: "VOO", quantityMicro: 2_000_000, grossCents: 1, commissionCents: 0 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rebuilds the holding when an older trade is corrected (07-S01)", async () => {
    const svc = h.services.investmentService();
    const buy = await svc.record(USER, { brokerId: "brk-schwab", type: "BUY", localDate: "2026-10-01", ticker: "VOO", quantityMicro: 3_215_000, grossCents: 145_000, commissionCents: 15 });
    await svc.record(USER, { brokerId: "brk-schwab", type: "SELL", localDate: "2026-10-10", ticker: "VOO", quantityMicro: 1_000_000, grossCents: 50_000, commissionCents: 15 });
    const before = holding()!;
    const corrected = await svc.correct(USER, buy.transaction.id, { quantityMicro: 3_215_500, version: 1 });
    expect(corrected.transaction.version).toBe(2);
    expect(holding()).toMatchObject({ quantityMicro: 2_215_500, version: Number(before.version) + 1 });
    // The later sale's realized gain changed with the new average cost.
    const sale = h.dynamo.items(TABLES.INVESTMENT_TX_TABLE).find((t) => t.type === "SELL")!;
    expect(sale.realizedGainCents).toBe(50_000 - 15 - mulDivRound(145_015, 1_000_000, 3_215_500));
    await expect(svc.correct(USER, buy.transaction.id, { quantityMicro: 1, version: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it("validates and versions broker commission rules (07-S03)", async () => {
    const brokers = h.services.brokerService();
    const updated = await brokers.update(USER, "brk-schwab", { flatCents: 15, percentBps: 10 }, 1);
    expect(updated).toMatchObject({ name: "Schwab", flatCents: 15, percentBps: 10, version: 2 });
    await expect(brokers.update(USER, "brk-schwab", { flatCents: 15, percentBps: 0 }, 1)).rejects.toMatchObject({ status: 409 });
    await expect(brokers.update(USER, "brk-schwab", { flatCents: -1, percentBps: 0 }, 2)).rejects.toMatchObject({ status: 400 });
  });

  it("values holdings at fresh prices, caches them, and marks stale prices when the feed fails (07-S02)", async () => {
    const svc = h.services.investmentService();
    await svc.record(USER, { brokerId: "brk-schwab", type: "BUY", localDate: "2026-10-01", ticker: "VOO", quantityMicro: 3_215_000, grossCents: 145_000, commissionCents: 15 });
    h.prices.prices.VOO = 50_150;
    const v1 = await h.services.valuationService().value(USER);
    expect(v1.holdings[0]).toMatchObject({ marketValueCents: 161_232, price: { priceCents: 50_150, stale: false } });
    expect(v1.totalValueCents).toBe(161_232);

    h.clock.set(new Date("2026-10-20T15:10:00Z"));
    await h.services.valuationService().value(USER);
    expect(h.prices.calls).toEqual(["VOO"]); // served from the 15-minute cache

    h.clock.set(new Date("2026-10-20T16:00:00Z"));
    delete h.prices.prices.VOO;
    const v3 = await h.services.valuationService().value(USER);
    expect(v3.holdings[0].price).toMatchObject({ stale: true, retrievedAt: "2026-10-20T15:00:00.000Z" });
  });

  it("reports prices as unavailable when there is no price at all", async () => {
    await h.services.investmentService().record(USER, { brokerId: "brk-schwab", type: "BUY", localDate: "2026-10-01", ticker: "BTC/USD", quantityMicro: 10_000, grossCents: 60_000, commissionCents: 0 });
    const v = await h.services.valuationService().value(USER);
    expect(v).toMatchObject({ totalValueCents: 0, incomplete: true });
    expect(v.holdings[0].marketValueCents).toBeUndefined();
  });

  it("estimates what selling everything would return, net of commissions, plus cash (07-S05)", async () => {
    const svc = h.services.investmentService();
    await svc.record(USER, { brokerId: "brk-schwab", type: "DEPOSIT", localDate: "2026-10-01", amountCents: 200_000, commissionCents: 0 });
    await svc.record(USER, { brokerId: "brk-schwab", type: "BUY", localDate: "2026-10-01", ticker: "VOO", quantityMicro: 3_215_000, grossCents: 145_000, commissionCents: 15 });
    await h.services.brokerService().update(USER, "brk-schwab", { flatCents: 15, percentBps: 25 }, 1);
    h.prices.prices.VOO = 50_150;
    const l = await h.services.valuationService().liquidation(USER);
    expect(l.holdings[0]).toMatchObject({ marketValueCents: 161_232, sellCommissionCents: 15 + 403, netCents: 161_232 - 418, unrealizedGainCents: 161_232 - 418 - 145_015 });
    expect(l.cashCents).toBe(200_000 - 145_015);
    expect(l.totalCents).toBe(161_232 - 418 + 54_985);
    expect(l.priceTime).toBe("2026-10-20T15:00:00.000Z");
  });
});

describe("HttpMarketPriceProvider (Twelve Data)", () => {
  const ssm = mockClient(SSMClient);
  afterEach(() => ssm.reset());
  const params = () => new ParameterStore(new SSMClient({ region: "us-east-2", credentials: { accessKeyId: "x", secretAccessKey: "y" } }));

  it("reports prices unavailable while /FinanceApp/prices/apiKey does not exist", async () => {
    ssm.on(GetParameterCommand).rejects(Object.assign(new Error("not found"), { name: "ParameterNotFound" }));
    const fetchFn = vi.fn();
    const provider = new HttpMarketPriceProvider(params(), "/FinanceApp/prices/apiKey", fetchFn as unknown as typeof fetch);
    await expect(provider.quote("VOO")).rejects.toBeInstanceOf(PriceUnavailableError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("reads the decrypted key once and converts the quote to cents", async () => {
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: "fake-key" } });
    const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify({ price: "501.50499" }), { status: 200 }));
    const provider = new HttpMarketPriceProvider(params(), "/FinanceApp/prices/apiKey", fetchFn as unknown as typeof fetch);
    expect(await provider.quote("VOO")).toBe(50_150);
    expect(await provider.quote("BTC/USD")).toBe(50_150);
    expect(ssm.commandCalls(GetParameterCommand)).toHaveLength(1);
    expect(ssm.commandCalls(GetParameterCommand)[0].args[0].input).toMatchObject({ Name: "/FinanceApp/prices/apiKey", WithDecryption: true });
    expect(String(fetchFn.mock.calls[1][0])).toContain("symbol=BTC%2FUSD");
  });

  it("treats an error body as unavailable", async () => {
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: "fake-key" } });
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ code: 401, status: "error", message: "bad key" }), { status: 200 }));
    await expect(new HttpMarketPriceProvider(params(), "p", fetchFn as unknown as typeof fetch).quote("VOO")).rejects.toBeInstanceOf(PriceUnavailableError);
  });
});
