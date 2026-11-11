/**
 * Every DynamoDB key string is built here (sequence README, "Keys and indexes").
 */
export const GLOBAL_PK = 'GLOBAL';
export const GLOBAL_SK = '#';
export const UNCATEGORIZED = 'uncategorized';

export type MonthDimension = 'TOTAL' | 'CAT' | 'TAG' | 'INV';

export const Keys = {
  user: (userId: string) => `USER#${userId}`,
  txn: (date: string, id: string) => `TXN#${date}#${id}`,
  inv: (date: string, id: string) => `INV#${date}#${id}`,
  day: (date: string) => `DAY#${date}#TOTAL`,
  month: (month: string, dimension: MonthDimension, id?: string | null) =>
    dimension === 'TOTAL' || dimension === 'INV' ? `MONTH#${month}#${dimension}` : `MONTH#${month}#${dimension}#${id}`,
  budgetPrefix: (budgetId: string) => `BUDGET#${budgetId}#`,
  budgetPeriod: (budgetId: string, periodStart: string) => `BUDGET#${budgetId}#P#${periodStart}`,
  budgetDay: (budgetId: string, date: string) => `BUDGET#${budgetId}#D#${date}`,
  holding: (brokerId: string, ticker: string) => `HOLDING#${brokerId}#${ticker}`,
  cash: (brokerId: string) => `CASH#${brokerId}`,
  fx: (date: string) => `FX#USD-CRC#${date}`,
  price: (ticker: string) => `PRICE#${ticker}`,
  token: (hash: string) => `TOKEN#${hash}`,
  account: (id: string) => `ACCOUNT#${id}`,
  broker: (id: string) => `BROKER#${id}`,
  budget: (id: string) => `BUDGET#${id}`,
  category: (id: string) => `CAT#${id}`,
  tag: (id: string) => `TAG#${id}`,
  rule: (merchantKey: string) => `RULE#${merchantKey}`,
  profile: () => 'PROFILE',
  connection: (id: string) => `CONN#gmail#${id}`,
  importJob: (id: string) => `IMPORT#${id}`,
  file: (sha256: string) => `FILE#${sha256}`,
  rowFingerprint: (hash: string) => `ROWFP#${hash}`,
  message: (messageId: string) => `MSG#${messageId}`,
  tickerIndex: (userId: string, ticker: string) => `USER#${userId}#${ticker}`,
};

/**
 * Transaction and investment ids start with their local date (`yyyymmdd-<uuid>`),
 * so `get(userId, id)` can rebuild the `TXN#<date>#<id>` sort key without an index.
 */
export function newDatedId(localDate: string, random: string = crypto.randomUUID()): string {
  return `${localDate.replace(/-/g, '')}-${random}`;
}

export function dateFromDatedId(id: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})-[A-Za-z0-9-]+$/.exec(id);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
