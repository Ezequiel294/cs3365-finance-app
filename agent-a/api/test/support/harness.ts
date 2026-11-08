import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetParameterCommand, GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import type { FxRate } from "@finance/shared";
import { mockClient } from "aws-sdk-client-mock";
import { FixedClock } from "../../src/clock";
import { Config } from "../../src/config";
import type { FxRateProvider } from "../../src/fx/fx-rate-provider";
import type { DkimVerifier } from "../../src/ingest/dkim-verifier";
import { PriceUnavailableError, type MarketPriceProvider } from "../../src/investments/market-price-provider";
import { Keys } from "../../src/keys";
import { GLOBAL_CATEGORIES, GLOBAL_RULES, GLOBAL_TAGS } from "../../src/reference/global-seed";
import { ServiceFactory } from "../../src/service-factory";
import { FakeDynamo } from "./fake-dynamo";

export const TABLES = {
  TRANSACTIONS_TABLE: "Transactions",
  INVESTMENT_TX_TABLE: "InvestmentTx",
  AGGREGATES_TABLE: "Aggregates",
  REFERENCE_TABLE: "Reference",
  INGESTION_TABLE: "Ingestion",
};

export const TEST_ENV = {
  ...TABLES,
  RAW_BUCKET: "financeapp-test-raw",
  BCCR_PARAM_PREFIX: "/FinanceApp/bccr",
  PRICE_API_KEY_PARAM: "/FinanceApp/prices/apiKey",
  INGEST_BASE_URL: "https://api.example.test",
};

export const USER = "11111111-2222-3333-4444-555555555555";

export class FakeFxProvider implements FxRateProvider {
  calls: string[] = [];
  constructor(public rates: Record<string, number> = {}, public fallback: number | null | undefined = 500) {}
  async rateFor(date: string): Promise<FxRate | undefined> {
    this.calls.push(date);
    const rate = this.rates[date] ?? this.fallback ?? undefined;
    return rate === undefined ? undefined : { date, rate, rateDate: date, source: "TEST" };
  }
}

export class FakePriceProvider implements MarketPriceProvider {
  calls: string[] = [];
  constructor(public prices: Record<string, number> = {}) {}
  async quote(ticker: string): Promise<number> {
    this.calls.push(ticker);
    const p = this.prices[ticker];
    if (p === undefined) throw new PriceUnavailableError("no price");
    return p;
  }
}

export interface Harness {
  dynamo: FakeDynamo;
  s3Objects: Map<string, Uint8Array>;
  clock: FixedClock;
  fx: FakeFxProvider;
  prices: FakePriceProvider;
  services: ServiceFactory;
  dkimResult: { value: boolean };
  restore(): void;
}

export function createHarness(options: { now?: string } = {}): Harness {
  const dynamo = new FakeDynamo();
  const s3Mock = mockClient(S3Client);
  const ssmMock = mockClient(SSMClient);
  const s3Objects = new Map<string, Uint8Array>();
  s3Mock.on(PutObjectCommand).callsFake((input) => {
    const body = input.Body as string | Uint8Array;
    s3Objects.set(input.Key!, typeof body === "string" ? new TextEncoder().encode(body) : body);
    return {};
  });
  s3Mock.on(GetObjectCommand).callsFake((input) => {
    const bytes = s3Objects.get(input.Key!);
    if (!bytes) throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" });
    return { Body: { transformToByteArray: async () => bytes } };
  });
  ssmMock.on(GetParameterCommand).rejects(Object.assign(new Error("missing"), { name: "ParameterNotFound" }));
  ssmMock.on(GetParametersCommand).resolves({ Parameters: [], InvalidParameters: [] });

  const clock = new FixedClock(new Date(options.now ?? "2026-10-20T15:00:00Z"));
  const fx = new FakeFxProvider();
  const prices = new FakePriceProvider();
  const dkimResult = { value: true };
  const dkim = { verify: async () => dkimResult.value } as unknown as DkimVerifier;
  const credentials = { accessKeyId: "test", secretAccessKey: "test" };
  const services = new ServiceFactory(new Config(TEST_ENV), {
    dynamo: dynamo.client,
    s3: new S3Client({ region: "us-east-2", credentials }),
    ssm: new SSMClient({ region: "us-east-2", credentials }),
    clock,
    fxProvider: fx,
    priceProvider: prices,
    dkim,
  });

  for (const c of GLOBAL_CATEGORIES) dynamo.put(TABLES.REFERENCE_TABLE, { PK: Keys.GLOBAL, SK: Keys.category(c.id), ...c, archived: false });
  for (const t of GLOBAL_TAGS) dynamo.put(TABLES.REFERENCE_TABLE, { PK: Keys.GLOBAL, SK: Keys.tag(t.id), ...t, archived: false });
  for (const r of GLOBAL_RULES) {
    dynamo.put(TABLES.REFERENCE_TABLE, { PK: Keys.GLOBAL, SK: Keys.rule(r.merchantKey), merchantKey: r.merchantKey, categoryId: r.categoryId, tagIds: r.tagIds });
  }

  return {
    dynamo,
    s3Objects,
    clock,
    fx,
    prices,
    services,
    dkimResult,
    restore() {
      dynamo.reset();
      s3Mock.restore();
      ssmMock.restore();
    },
  };
}

export async function addAccount(h: Harness, account: { id?: string; currency?: "USD" | "CRC"; last4?: string } = {}) {
  const id = account.id ?? "acc-main";
  h.dynamo.put(TABLES.REFERENCE_TABLE, {
    PK: Keys.user(USER),
    SK: Keys.account(id),
    id,
    name: "Main card",
    bank: "Example Bank",
    type: "credit_card",
    currency: account.currency ?? "CRC",
    last4: account.last4 ?? "1234",
  });
  return id;
}
