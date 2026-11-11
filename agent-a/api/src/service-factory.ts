import { S3Client } from '@aws-sdk/client-s3';
import { SSMClient } from '@aws-sdk/client-ssm';
import { SystemClock, type Clock } from './clock';
import { Config } from './config';
import { renderGmailScript } from './gmail-script';
import { CsvReader } from './ingest/csv-reader';
import { CsvTemplateParser } from './ingest/csv-template-parser';
import { DkimVerifier } from './ingest/dkim-verifier';
import { DuplicateMatcher } from './ingest/duplicate-matcher';
import { EmailTemplateParser } from './ingest/email-template-parser';
import { IngestPipeline } from './ingest/ingest-pipeline';
import { KindResolver } from './ingest/kind-resolver';
import { TemplateRegistry } from './ingest/template-registry';
import { AggregateRepository } from './repositories/aggregate-repository';
import { DynamoStore } from './repositories/dynamo-store';
import { IngestionRepository } from './repositories/ingestion-repository';
import { InvestmentTxRepository } from './repositories/investment-tx-repository';
import { ParameterStore } from './repositories/parameter-store';
import { RawObjectStore } from './repositories/raw-object-store';
import { ReferenceRepository } from './repositories/reference-repository';
import { TransactionRepository } from './repositories/transaction-repository';
import { AccountService } from './services/account-service';
import { BccrRateProvider } from './services/bccr-rate-provider';
import { BrokerService } from './services/broker-service';
import { BudgetAnalyticsService } from './services/budget-analytics-service';
import { BudgetMatcher } from './services/budget-matcher';
import { BudgetService } from './services/budget-service';
import { Categorizer } from './services/categorizer';
import { ConnectionService } from './services/connection-service';
import { FxService } from './services/fx-service';
import { HoldingCalculator } from './services/holding-calculator';
import { ImportService } from './services/import-service';
import { InvestmentService } from './services/investment-service';
import { Normalizer } from './services/normalizer';
import { PeriodCalculator } from './services/period-calculator';
import { PriceClient } from './services/price-client';
import { FallbackPriceProvider, TwelveDataPriceProvider, YahooChartPriceProvider } from './services/price-providers';
import { ReviewService } from './services/review-service';
import { RollupPlanner } from './services/rollup-planner';
import { RuleService } from './services/rule-service';
import { SpendingAnalyticsService } from './services/spending-analytics-service';
import { TaxonomyService } from './services/taxonomy-service';
import { TransactionQueryService } from './services/transaction-query-service';
import { TransactionService } from './services/transaction-service';
import { ValuationService } from './services/valuation-service';

/** Builds each client, repository, and service once per Lambda container. */
export class ServiceFactory {
  private readonly cache = new Map<string, unknown>();

  constructor(
    private readonly config: Config = new Config(),
    private readonly clock: Clock = new SystemClock(),
  ) {}

  private once<T>(name: string, build: () => T): T {
    if (!this.cache.has(name)) this.cache.set(name, build());
    return this.cache.get(name) as T;
  }

  // ---------- Clients and repositories ----------

  store = () => this.once('store', () => DynamoStore.create());
  s3 = () => this.once('s3', () => new S3Client({}));
  parameterStore = () => this.once('ssm', () => new ParameterStore(new SSMClient({})));
  transactionRepository = () => this.once('txRepo', () => new TransactionRepository(this.store(), this.config.transactionsTable));
  investmentTxRepository = () => this.once('invRepo', () => new InvestmentTxRepository(this.store(), this.config.investmentTxTable));
  aggregateRepository = () => this.once('aggRepo', () => new AggregateRepository(this.store(), this.config.aggregatesTable));
  referenceRepository = () => this.once('refRepo', () => new ReferenceRepository(this.store(), this.config.referenceTable));
  ingestionRepository = () => this.once('ingRepo', () => new IngestionRepository(this.store(), this.config.ingestionTable));
  rawObjectStore = () => this.once('raw', () => new RawObjectStore(this.s3(), this.config.rawBucket));

  // ---------- Helpers ----------

  normalizer = () => this.once('normalizer', () => new Normalizer());
  periodCalculator = () => this.once('periods', () => new PeriodCalculator());
  budgetMatcher = () => this.once('matcher', () => new BudgetMatcher(this.periodCalculator()));
  rollupPlanner = () => this.once('planner', () => new RollupPlanner());
  categorizer = () => this.once('categorizer', () => new Categorizer(this.referenceRepository()));
  templateRegistry = () => this.once('registry', () => new TemplateRegistry());
  fxService = () =>
    this.once(
      'fx',
      () =>
        new FxService(
          new BccrRateProvider(this.parameterStore(), this.config.bccrParamPrefix),
          this.aggregateRepository(),
          this.clock,
        ),
    );

  // ---------- Services ----------

  transactionService = () =>
    this.once(
      'txService',
      () =>
        new TransactionService(
          this.transactionRepository(),
          this.aggregateRepository(),
          this.referenceRepository(),
          this.store(),
          this.fxService(),
          this.normalizer(),
          this.categorizer(),
          this.budgetMatcher(),
          this.rollupPlanner(),
          this.clock,
        ),
    );
  transactionQueryService = () => this.once('txQuery', () => new TransactionQueryService(this.transactionRepository()));
  accountService = () => this.once('accounts', () => new AccountService(this.referenceRepository()));
  ruleService = () => this.once('rules', () => new RuleService(this.referenceRepository()));
  taxonomyService = () => this.once('taxonomy', () => new TaxonomyService(this.referenceRepository()));

  ingestPipeline = () =>
    this.once(
      'pipeline',
      () =>
        new IngestPipeline(
          this.ingestionRepository(),
          this.referenceRepository(),
          this.rawObjectStore(),
          new CsvReader(),
          this.templateRegistry(),
          new CsvTemplateParser(),
          new EmailTemplateParser(),
          new KindResolver(),
          this.normalizer(),
          this.categorizer(),
          new DuplicateMatcher(this.transactionRepository()),
          this.transactionService(),
          new DkimVerifier(),
          this.clock,
        ),
    );
  importService = () =>
    this.once(
      'imports',
      () => new ImportService(this.ingestionRepository(), this.referenceRepository(), this.rawObjectStore(), this.clock),
    );
  connectionService = () =>
    this.once(
      'connections',
      () => new ConnectionService(this.ingestionRepository(), this.templateRegistry(), this.clock, renderGmailScript),
    );
  reviewService = () =>
    this.once(
      'review',
      () =>
        new ReviewService(this.transactionRepository(), this.ingestionRepository(), this.ingestPipeline(), this.transactionService()),
    );
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
      () => new BudgetAnalyticsService(this.referenceRepository(), this.aggregateRepository(), this.periodCalculator(), this.clock),
    );
  spendingAnalyticsService = () =>
    this.once('spending', () => new SpendingAnalyticsService(this.aggregateRepository(), this.referenceRepository()));
  investmentService = () =>
    this.once(
      'investments',
      () =>
        new InvestmentService(
          this.investmentTxRepository(),
          this.aggregateRepository(),
          this.referenceRepository(),
          this.store(),
          new HoldingCalculator(),
          this.clock,
        ),
    );
  brokerService = () => this.once('brokers', () => new BrokerService(this.referenceRepository()));

  /** Yahoo first; Twelve Data only when its key parameter exists in SSM. */
  priceClient = () =>
    this.once('prices', () => {
      const keyParam = this.config.twelveDataKeyParam;
      const provider = new FallbackPriceProvider(
        [new YahooChartPriceProvider()],
        keyParam
          ? async () => {
              const key = await this.parameterStore().getOptional(keyParam);
              return key ? [new TwelveDataPriceProvider(key)] : [];
            }
          : undefined,
      );
      return new PriceClient(this.aggregateRepository(), provider, this.clock);
    });
  valuationService = () =>
    this.once(
      'valuation',
      () => new ValuationService(this.aggregateRepository(), this.referenceRepository(), this.priceClient(), this.clock),
    );
}
