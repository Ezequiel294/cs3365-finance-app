import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import gmailScript from '../../gmail-script/Code.gs';
import { AccountService } from './accounts/account-service';
import { SpendingAnalyticsService } from './analytics/spending-analytics-service';
import { BudgetAnalyticsService } from './budgets/budget-analytics-service';
import { BudgetMatcher } from './budgets/budget-matcher';
import { BudgetService } from './budgets/budget-service';
import { PeriodCalculator } from './budgets/period-calculator';
import { CatalogService } from './categorization/catalog-service';
import { Categorizer } from './categorization/categorizer';
import { Normalizer } from './categorization/normalizer';
import { RuleService } from './categorization/rule-service';
import { SettingsService } from './categorization/settings-service';
import { type Clock, SystemClock } from './clock';
import { Config } from './config';
import { ConnectionService } from './connections/connection-service';
import { RollupPlanner } from './core/rollup-planner';
import { TransactionQueryService } from './core/transaction-query-service';
import { TransactionService } from './core/transaction-service';
import { BccrRateProvider } from './fx/bccr-rate-provider';
import { FxService } from './fx/fx-service';
import { CsvTemplateParser } from './ingest/csv-template-parser';
import { DkimVerifier } from './ingest/dkim-verifier';
import { DuplicateMatcher } from './ingest/duplicate-matcher';
import { EmailTemplateParser } from './ingest/email-template-parser';
import { ImportService } from './ingest/import-service';
import { IngestPipeline } from './ingest/ingest-pipeline';
import { KindResolver } from './ingest/kind-resolver';
import { TemplateRegistry } from './ingest/template-registry';
import { BrokerService } from './investments/broker-service';
import { HoldingCalculator } from './investments/holding-calculator';
import { InvestmentService } from './investments/investment-service';
import { PriceClient } from './investments/price-client';
import {
  FallbackPriceProvider,
  type MarketPriceProvider,
  TwelveDataPriceProvider,
  YahooChartPriceProvider,
} from './investments/price-providers';
import { ValuationService } from './investments/valuation-service';
import { AggregateRepository } from './repositories/aggregate-repository';
import { DynamoStore } from './repositories/dynamo-store';
import { IngestionRepository } from './repositories/ingestion-repository';
import { InvestmentTxRepository } from './repositories/investment-tx-repository';
import { ParameterStore } from './repositories/parameter-store';
import { RawObjectStore } from './repositories/raw-object-store';
import { ReferenceRepository } from './repositories/reference-repository';
import { TransactionRepository } from './repositories/transaction-repository';
import { ReviewService } from './review/review-service';

/** Builds each client, repository, and service once per Lambda container. */
export class ServiceFactory {
  private readonly cache = new Map<string, unknown>();

  constructor(
    readonly config: Config = new Config(),
    readonly clock: Clock = new SystemClock(),
  ) {}

  private once<T>(key: string, build: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, build());
    return this.cache.get(key) as T;
  }

  // ---------- clients and repositories ----------
  store(): DynamoStore {
    return this.once('store', () => {
      const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: false },
      });
      return new DynamoStore(client);
    });
  }
  private s3 = () => this.once('s3', () => new S3Client({}));
  private ssm = () => this.once('ssm', () => new SSMClient({}));
  parameterStore = () => this.once('params', () => new ParameterStore(this.ssm()));
  transactionRepository = () =>
    this.once('txRepo', () => new TransactionRepository(this.store(), this.config.transactionsTable));
  investmentTxRepository = () =>
    this.once('invRepo', () => new InvestmentTxRepository(this.store(), this.config.investmentTxTable));
  aggregateRepository = () => this.once('aggRepo', () => new AggregateRepository(this.store(), this.config.aggregatesTable));
  referenceRepository = () => this.once('refRepo', () => new ReferenceRepository(this.store(), this.config.referenceTable));
  ingestionRepository = () => this.once('ingRepo', () => new IngestionRepository(this.store(), this.config.ingestionTable));
  rawObjectStore = () => this.once('raw', () => new RawObjectStore(this.s3(), this.config.rawBucket));

  // ---------- helpers ----------
  private normalizer = () => this.once('normalizer', () => new Normalizer());
  private periodCalculator = () => this.once('periods', () => new PeriodCalculator());
  private budgetMatcher = () => this.once('matcher', () => new BudgetMatcher(this.periodCalculator()));
  private categorizer = () => this.once('categorizer', () => new Categorizer(this.referenceRepository()));
  templateRegistry = () => this.once('registry', () => new TemplateRegistry());
  fxService = () =>
    this.once(
      'fx',
      () =>
        new FxService(
          new BccrRateProvider(this.parameterStore(), this.config.bccrParamPrefix),
          this.aggregateRepository(),
        ),
    );

  // ---------- services ----------
  transactionService(): TransactionService {
    return this.once(
      'txService',
      () =>
        new TransactionService({
          fx: this.fxService(),
          normalizer: this.normalizer(),
          categorizer: this.categorizer(),
          budgetMatcher: this.budgetMatcher(),
          planner: new RollupPlanner(),
          reference: this.referenceRepository(),
          transactions: this.transactionRepository(),
          aggregates: this.aggregateRepository(),
          store: this.store(),
          clock: this.clock,
        }),
    );
  }
  transactionQueryService = () =>
    this.once('txQuery', () => new TransactionQueryService(this.transactionRepository()));
  accountService = () =>
    this.once('accounts', () => new AccountService(this.referenceRepository(), this.transactionRepository()));

  ingestPipeline(): IngestPipeline {
    return this.once(
      'pipeline',
      () =>
        new IngestPipeline({
          raw: this.rawObjectStore(),
          registry: this.templateRegistry(),
          csvParser: new CsvTemplateParser(),
          emailParser: new EmailTemplateParser(),
          kindResolver: new KindResolver(),
          normalizer: this.normalizer(),
          categorizer: this.categorizer(),
          fx: this.fxService(),
          duplicates: new DuplicateMatcher(this.transactionRepository()),
          transactions: this.transactionService(),
          ingestion: this.ingestionRepository(),
          reference: this.referenceRepository(),
          dkim: new DkimVerifier(),
          clock: this.clock,
        }),
    );
  }
  importService = () =>
    this.once(
      'imports',
      () => new ImportService(this.ingestionRepository(), this.referenceRepository(), this.rawObjectStore(), this.clock),
    );
  connectionService = () =>
    this.once(
      'connections',
      () =>
        new ConnectionService(
          this.ingestionRepository(),
          this.templateRegistry(),
          this.clock,
          gmailScript,
          this.config.apiBaseUrl ?? '',
        ),
    );
  reviewService = () =>
    this.once(
      'review',
      () =>
        new ReviewService(
          this.transactionRepository(),
          this.ingestionRepository(),
          () => this.ingestPipeline(),
          this.store(),
        ),
    );
  ruleService = () => this.once('rules', () => new RuleService(this.referenceRepository()));
  catalogService = () => this.once('catalog', () => new CatalogService(this.referenceRepository()));
  settingsService = () =>
    this.once('settings', () => new SettingsService(this.referenceRepository(), () => this.budgetService()));
  budgetService = () =>
    this.once(
      'budgets',
      () =>
        new BudgetService(
          this.referenceRepository(),
          this.transactionRepository(),
          this.aggregateRepository(),
          this.budgetMatcher(),
          this.periodCalculator(),
          this.clock,
        ),
    );
  budgetAnalyticsService = () =>
    this.once(
      'budgetAnalytics',
      () =>
        new BudgetAnalyticsService(
          this.referenceRepository(),
          this.aggregateRepository(),
          this.periodCalculator(),
          this.clock,
        ),
    );
  spendingAnalyticsService = () =>
    this.once('spending', () => new SpendingAnalyticsService(this.aggregateRepository(), this.referenceRepository()));
  brokerService = () => this.once('brokers', () => new BrokerService(this.referenceRepository()));
  investmentService = () =>
    this.once(
      'investments',
      () =>
        new InvestmentService(
          this.referenceRepository(),
          this.investmentTxRepository(),
          this.aggregateRepository(),
          new HoldingCalculator(),
          this.store(),
          this.clock,
        ),
    );

  /** Yahoo always; Twelve Data only when its key parameter exists in SSM. */
  priceClient(): PriceClient {
    return this.once('prices', () => {
      const keyParam = this.config.twelveDataKeyParam;
      const extras = async (): Promise<MarketPriceProvider[]> => {
        if (!keyParam) return [];
        const key = await this.parameterStore().getOptional(keyParam);
        return key ? [new TwelveDataPriceProvider(key)] : [];
      };
      const provider = new FallbackPriceProvider([new YahooChartPriceProvider()], extras);
      return new PriceClient(this.aggregateRepository(), provider, this.clock);
    });
  }
  valuationService = () =>
    this.once(
      'valuation',
      () =>
        new ValuationService(this.aggregateRepository(), this.referenceRepository(), this.priceClient(), this.clock),
    );
}
