/**
 * Every DynamoDB key is built here (sequence README, "Keys and indexes").
 * Repositories strip PK and SK before returning items, so services never see key strings.
 */
export const GLOBAL_PK = 'GLOBAL';

export const Keys = {
  user: (userId: string) => `USER#${userId}`,
  txn: (date: string, id: string) => `TXN#${date}#${id}`,
  inv: (date: string, id: string) => `INV#${date}#${id}`,
  day: (date: string) => `DAY#${date}#TOTAL`,
  /** MONTH#<yyyy-mm>#TOTAL, MONTH#<yyyy-mm>#CAT#<id>, MONTH#<yyyy-mm>#TAG#<id>, MONTH#<yyyy-mm>#INV */
  month: (month: string, dimension: 'TOTAL' | 'CAT' | 'TAG' | 'INV', id?: string) =>
    dimension === 'TOTAL' || dimension === 'INV'
      ? `MONTH#${month}#${dimension}`
      : `MONTH#${month}#${dimension}#${id}`,
  budgetPeriod: (budgetId: string, periodStart: string) => `BUDGET#${budgetId}#P#${periodStart}`,
  budgetDay: (budgetId: string, date: string) => `BUDGET#${budgetId}#D#${date}`,
  budgetPrefix: (budgetId: string) => `BUDGET#${budgetId}#`,
  holding: (brokerId: string, ticker: string) => `HOLDING#${brokerId}#${ticker}`,
  cash: (brokerId: string) => `CASH#${brokerId}`,
  /** Global FX item: PK = FX#USD-CRC#<date>, SK = RATE. */
  fx: (date: string) => `FX#USD-CRC#${date}`,
  /** Global price item: PK = PRICE#<ticker>, SK = QUOTE. */
  price: (ticker: string) => `PRICE#${ticker}`,
  /** Ingest token lookup: PK = TOKEN#<sha256>, SK = TOKEN. */
  token: (hash: string) => `TOKEN#${hash}`,
  account: (id: string) => `ACCOUNT#${id}`,
  broker: (id: string) => `BROKER#${id}`,
  category: (id: string) => `CAT#${id}`,
  tag: (id: string) => `TAG#${id}`,
  rule: (merchantKey: string) => `RULE#${merchantKey}`,
  budget: (id: string) => `BUDGET#${id}`,
  profile: () => 'PROFILE',
  connection: (id: string) => `CONN#gmail#${id}`,
  file: (sha256: string) => `FILE#${sha256}`,
  importJob: (id: string) => `IMPORT#${id}`,
  rowFingerprint: (hash: string) => `ROWFP#${hash}`,
  message: (messageId: string) => `MSG#${messageId}`,
  /** Ticker GSI partition on InvestmentTx: USER#<id>#<ticker>. */
  tickerIndex: (userId: string, ticker: string) => `USER#${userId}#${ticker}`,
  FX_SK: 'RATE',
  PRICE_SK: 'QUOTE',
  TOKEN_SK: 'TOKEN',
};

/** Date part encoded in a transaction or investment id: "20261014-…" → "2026-10-14". */
export function dateFromId(id: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})-[A-Za-z0-9]+$/.exec(id);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
