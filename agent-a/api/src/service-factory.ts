import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SpendingAnalyticsService } from "./analytics/spending-analytics-service";
import { BudgetAnalyticsService } from "./budgets/budget-analytics-service";
import { BudgetMatcher } from "./budgets/budget-matcher";
import { BudgetService } from "./budgets/budget-service";
import { PeriodCalculator } from "./budgets/period-calculator";
import { Categorizer } from "./categorization/categorizer";
import { Normalizer } from "./categorization/normalizer";
import { RuleService } from "./categorization/rule-service";
import { SystemClock, type Clock } from "./clock";
import { Config } from "./config";
import { ConnectionService } from "./connections/connection-service";
import { BccrRateProvider } from "./fx/bccr-rate-provider";
import type { FxRateProvider } from "./fx/fx-rate-provider";
import { FxService } from "./fx/fx-service";
import { CsvTemplateParser } from "./ingest/csv-template-parser";
import { DkimVerifier } from "./ingest/dkim-verifier";
import { DuplicateMatcher } from "./ingest/duplicate-matcher";
import { EmailTemplateParser } from "./ingest/email-template-parser";
import { ImportService } from "./ingest/import-service";
import { IngestPipeline } from "./ingest/ingest-pipeline";
import { ParsedRowSchema } from "./ingest/parsed-row-schema";
import { TemplateRegistry } from "./ingest/template-registry";
import { BrokerService } from "./investments/broker-service";
import { HoldingCalculator } from "./investments/holding-calculator";
import { HttpMarketPriceProvider } from "./investments/http-market-price-provider";
import { InvestmentService } from "./investments/investment-service";
import type { MarketPriceProvider } from "./investments/market-price-provider";
import { PriceClient } from "./investments/price-client";
import { ValuationService } from "./investments/valuation-service";
import { ReferenceService } from "./reference/reference-service";
import { AggregateRepository } from "./repositories/aggregate-repository";
import { DynamoStore } from "./repositories/dynamo-store";
import { IngestionRepository } from "./repositories/ingestion-repository";
import { InvestmentTxRepository } from "./repositories/investment-tx-repository";
import { ParameterStore } from "./repositories/parameter-store";
import { RawObjectStore } from "./repositories/raw-object-store";
import { ReferenceRepository } from "./repositories/reference-repository";
import { TransactionRepository } from "./repositories/transaction-repository";
import { ReviewService } from "./review/review-service";
import { TransactionQueryService } from "./transactions/transaction-query-service";
import { RollupPlanner } from "./transactions/rollup-planner";
import { TransactionService } from "./transactions/transaction-service";

export interface FactoryOverrides {
  dynamo?: DynamoDBDocumentClient;
  s3?: S3Client;
  ssm?: SSMClient;
  clock?: Clock;
  fxProvider?: FxRateProvider;
  priceProvider?: MarketPriceProvider;
  dkim?: DkimVerifier;
}

/**
 * Builds each client, repository, and service once per Lambda container and wires dependencies
 * through constructors. Tests pass mocked clients and fakes through `overrides`.
 */
export class ServiceFactory {
  private readonly cache = new Map<string, unknown>();

  constructor(
    readonly config: Config,
    private readonly overrides: FactoryOverrides = {},
  ) {}

  private once<T>(key: string, build: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, build());
    return this.cache.get(key) as T;
  }

  // ----- clients and shared helpers -----
  clock(): Clock {
    return this.once("clock", () => this.overrides.clock ?? new SystemClock());
  }
  private dynamo(): DynamoDBDocumentClient {
    return this.once("dynamo", () => this.overrides.dynamo ?? DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } }));
  }
  private s3(): S3Client {
    return this.once("s3", () => this.overrides.s3 ?? new S3Client({}));
  }
  private ssm(): SSMClient {
    return this.once("ssm", () => this.overrides.ssm ?? new SSMClient({}));
  }
  store(): DynamoStore {
    return this.once("store", () => new DynamoStore(this.dynamo()));
  }
  parameterStore(): ParameterStore {
    return this.once("params", () => new ParameterStore(this.ssm()));
  }
  rawObjectStore(): RawObjectStore {
    return this.once("raw", () => new RawObjectStore(this.s3(), this.config.rawBucket));
  }
  normalizer(): Normalizer {
    return this.once("normalizer", () => new Normalizer());
  }
  periodCalculator(): PeriodCalculator {
    return this.once("periods", () => new PeriodCalculator());
  }
  budgetMatcher(): BudgetMatcher {
    return this.once("matcher", () => new BudgetMatcher(this.periodCalculator()));
  }
  templateRegistry(): TemplateRegistry {
    return this.once("templates", () => new TemplateRegistry());
  }

  // ----- repositories -----
  transactionRepository(): TransactionRepository {
    return this.once("txRepo", () => new TransactionRepository(this.store(), this.config.transactionsTable));
  }
  investmentTxRepository(): InvestmentTxRepository {
    return this.once("invRepo", () => new InvestmentTxRepository(this.store(), this.config.investmentTxTable));
  }
  aggregateRepository(): AggregateRepository {
    return this.once("aggRepo", () => new AggregateRepository(this.store(), this.config.aggregatesTable));
  }
  referenceRepository(): ReferenceRepository {
    return this.once("refRepo", () => new ReferenceRepository(this.store(), this.config.referenceTable));
  }
  ingestionRepository(): IngestionRepository {
    return this.once("ingRepo", () => new IngestionRepository(this.store(), this.config.ingestionTable));
  }

  // ----- services -----
  fxService(): FxService {
    return this.once("fx", () =>
      new FxService(this.aggregateRepository(), this.overrides.fxProvider ?? new BccrRateProvider(this.parameterStore(), this.config.bccrParamPrefix)),
    );
  }
  categorizer(): Categorizer {
    return this.once("categorizer", () => new Categorizer(this.referenceRepository()));
  }
  transactionService(): TransactionService {
    return this.once("txService", () =>
      new TransactionService(
        this.store(),
        this.transactionRepository(),
        this.aggregateRepository(),
        this.referenceRepository(),
        this.fxService(),
        this.normalizer(),
        this.categorizer(),
        this.budgetMatcher(),
        new RollupPlanner(),
        this.clock(),
      ),
    );
  }
  transactionQueryService(): TransactionQueryService {
    return this.once("txQuery", () => new TransactionQueryService(this.transactionRepository()));
  }
  ingestPipeline(): IngestPipeline {
    return this.once("pipeline", () =>
      new IngestPipeline(
        this.templateRegistry(),
        new CsvTemplateParser(),
        new EmailTemplateParser(),
        new ParsedRowSchema(),
        this.normalizer(),
        this.fxService(),
        new DuplicateMatcher(this.transactionRepository()),
        this.categorizer(),
        this.transactionService(),
        this.ingestionRepository(),
        this.referenceRepository(),
        this.rawObjectStore(),
        this.overrides.dkim ?? new DkimVerifier(),
        this.clock(),
      ),
    );
  }
  importService(): ImportService {
    return this.once("imports", () => new ImportService(this.ingestionRepository(), this.rawObjectStore(), this.referenceRepository(), this.clock()));
  }
  connectionService(): ConnectionService {
    return this.once("connections", () =>
      new ConnectionService(this.ingestionRepository(), this.templateRegistry(), this.clock(), this.config.ingestBaseUrl),
    );
  }
  reviewService(): ReviewService {
    return this.once("review", () => new ReviewService(this.transactionRepository(), this.ingestionRepository(), this.store()));
  }
  ruleService(): RuleService {
    return this.once("rules", () => new RuleService(this.referenceRepository()));
  }
  budgetService(): BudgetService {
    return this.once("budgets", () =>
      new BudgetService(this.referenceRepository(), this.transactionRepository(), this.aggregateRepository(), this.budgetMatcher(), this.periodCalculator(), this.clock()),
    );
  }
  budgetAnalyticsService(): BudgetAnalyticsService {
    return this.once("budgetAnalytics", () => new BudgetAnalyticsService(this.referenceRepository(), this.aggregateRepository(), this.periodCalculator(), this.clock()));
  }
  spendingAnalyticsService(): SpendingAnalyticsService {
    return this.once("spending", () => new SpendingAnalyticsService(this.aggregateRepository(), this.referenceRepository()));
  }
  investmentService(): InvestmentService {
    return this.once("investments", () =>
      new InvestmentService(this.store(), this.investmentTxRepository(), this.aggregateRepository(), this.referenceRepository(), new HoldingCalculator(), this.clock()),
    );
  }
  brokerService(): BrokerService {
    return this.once("brokers", () => new BrokerService(this.referenceRepository()));
  }
  priceClient(): PriceClient {
    return this.once("prices", () =>
      new PriceClient(
        this.aggregateRepository(),
        this.overrides.priceProvider ?? new HttpMarketPriceProvider(this.parameterStore(), this.config.priceApiKeyParam),
        this.clock(),
      ),
    );
  }
  valuationService(): ValuationService {
    return this.once("valuation", () => new ValuationService(this.aggregateRepository(), this.referenceRepository(), this.priceClient()));
  }
  referenceService(): ReferenceService {
    return this.once("reference", () => new ReferenceService(this.referenceRepository()));
  }
}
