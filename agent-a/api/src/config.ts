/**
 * Lambda configuration from environment variables. Values are table names, the bucket name,
 * SSM parameter names, and the public ingest URL — never secret values.
 */
export class Config {
  readonly transactionsTable: string;
  readonly investmentTxTable: string;
  readonly aggregatesTable: string;
  readonly referenceTable: string;
  readonly ingestionTable: string;
  readonly rawBucket: string;
  readonly bccrParamPrefix: string;
  readonly priceApiKeyParam: string;
  readonly ingestBaseUrl: string;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.transactionsTable = Config.getRequired("TRANSACTIONS_TABLE", env);
    this.investmentTxTable = Config.getRequired("INVESTMENT_TX_TABLE", env);
    this.aggregatesTable = Config.getRequired("AGGREGATES_TABLE", env);
    this.referenceTable = Config.getRequired("REFERENCE_TABLE", env);
    this.ingestionTable = Config.getRequired("INGESTION_TABLE", env);
    this.rawBucket = Config.getRequired("RAW_BUCKET", env);
    this.bccrParamPrefix = Config.getRequired("BCCR_PARAM_PREFIX", env).replace(/\/+$/, "");
    this.priceApiKeyParam = Config.getRequired("PRICE_API_KEY_PARAM", env);
    this.ingestBaseUrl = Config.getRequired("INGEST_BASE_URL", env).replace(/\/+$/, "");
  }

  /** Throws at start-up when a variable is missing, so a misconfigured Lambda fails on its first request. */
  static getRequired(name: string, env: Record<string, string | undefined> = process.env): string {
    const value = env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
  }
}
