/**
 * Environment configuration. Environment variables hold table names, the bucket name, and
 * SSM parameter *names*, never secret values.
 */
export class Config {
  static getRequired(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
  }

  static getOptional(name: string): string | undefined {
    const value = process.env[name];
    return value ? value : undefined;
  }

  readonly transactionsTable: string;
  readonly investmentTxTable: string;
  readonly aggregatesTable: string;
  readonly referenceTable: string;
  readonly ingestionTable: string;
  readonly rawBucket: string;
  readonly bccrParamPrefix: string;
  readonly twelveDataKeyParam: string | undefined;
  readonly apiBaseUrl: string | undefined;

  constructor() {
    this.transactionsTable = Config.getRequired('TRANSACTIONS_TABLE');
    this.investmentTxTable = Config.getRequired('INVESTMENT_TX_TABLE');
    this.aggregatesTable = Config.getRequired('AGGREGATES_TABLE');
    this.referenceTable = Config.getRequired('REFERENCE_TABLE');
    this.ingestionTable = Config.getRequired('INGESTION_TABLE');
    this.rawBucket = Config.getRequired('RAW_BUCKET');
    this.bccrParamPrefix = Config.getRequired('BCCR_PARAM_PREFIX');
    this.twelveDataKeyParam = Config.getOptional('TWELVE_DATA_KEY_PARAM');
    this.apiBaseUrl = Config.getOptional('API_BASE_URL');
  }
}
