/**
 * Domain model (class diagram section 1). These are the records stored in DynamoDB and
 * passed between the API and the web app. Repositories strip PK/SK before returning them.
 */

export const CURRENCIES = ['USD', 'CRC'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const TRANSACTION_KINDS = [
  'purchase',
  'refund',
  'income',
  'sinpe_sent',
  'sinpe_received',
  'payment_sent',
  'transfer',
  'card_payment',
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export type Flow = 'expense' | 'refund' | 'income' | 'excluded';

export const BANKS = ['BAC', 'BN'] as const;
export type Bank = (typeof BANKS)[number];

export type TransactionStatus = 'confirmed' | 'pending_review';
export type TransactionSource = 'manual' | 'gmail' | 'csv';
export type CategorizedBy = 'user' | 'rule' | 'global' | 'none';

export const BUDGET_PERIODS = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const WEEK_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export type ReviewReason = 'UNCATEGORIZED' | 'DUPLICATE';

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  localDate: string;
  occurredAt: string | null;
  kind: TransactionKind;
  status: TransactionStatus;
  currency: Currency;
  amountMinor: number;
  amountUsdCents: number;
  fxRate: number;
  fxDate: string;
  categoryId: string | null;
  tagIds: string[];
  categorizedBy: CategorizedBy;
  merchantRaw: string;
  merchantKey: string;
  sources: TransactionSource[];
  statementRef: string | null;
  possibleDuplicateOf: string | null;
  reviewReason: ReviewReason | null;
  version: number;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  bank: Bank;
  type: string;
  currency: Currency;
  iban: string | null;
  cardLast4s: string[];
  hasTransactions?: boolean;
  version: number;
}

export interface UserSettings {
  userId: string;
  timeZone: string;
  weekStart: WeekDay;
  baseCurrency: 'USD';
}

export interface Category {
  id: string;
  name: string;
  scope: 'global' | 'user';
  archived: boolean;
}

export interface Tag {
  id: string;
  name: string;
  scope: 'user';
  archived: boolean;
}

export interface Rule {
  merchantKey: string;
  categoryId: string | null;
  tagIds: string[];
  kind: TransactionKind | null;
  scope: 'global' | 'user';
}

export interface Budget {
  id: string;
  name: string;
  categoryIds: string[];
  tagIds: string[];
  period: BudgetPeriod;
  limitCents: number;
  startDate: string | null;
  endDate: string | null;
  version: number;
}

export interface BudgetPeriodTotal {
  budgetId: string;
  periodStart: string;
  spentCents: number;
  count: number;
  limitCents: number;
}

export interface BudgetDayTotal {
  budgetId: string;
  date: string;
  spentCents: number;
}

export interface SpendingRollup {
  bucket: string;
  dimension: 'TOTAL' | 'CAT' | 'TAG';
  dimensionId: string;
  expenseCents: number;
  incomeCents: number;
  count: number;
}

export interface FxRate {
  date: string;
  rate: number;
  rateDate: string;
  source: string;
}

export interface UsdConversion {
  amountUsdCents: number;
  fxRate: number;
  fxDate: string;
}

// ---------- Investments ----------

export const INVESTMENT_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'BUY', 'SELL'] as const;
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];
export const ASSET_CLASSES = ['SECURITY', 'CRYPTO'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];
export type CommissionSource = 'rule' | 'manual';

export interface InvestmentTransaction {
  id: string;
  userId: string;
  brokerId: string;
  type: InvestmentType;
  localDate: string;
  ticker: string | null;
  assetClass: AssetClass | null;
  quantityMicro: number;
  grossCents: number;
  amountCents: number;
  commissionCents: number;
  commissionSource: CommissionSource;
  name: string | null;
  version: number;
  createdAt: string;
}

export interface Fee {
  flatCents: number;
  percentBps: number;
}

export interface AssetFees {
  security: Fee;
  crypto: Fee;
}

export interface FeeSchedule {
  deposit: Fee;
  withdrawal: Fee;
  buy: AssetFees;
  sell: AssetFees;
}

export interface Broker {
  id: string;
  name: string;
  fees: FeeSchedule;
  version: number;
}

export interface Holding {
  brokerId: string;
  ticker: string;
  assetClass: AssetClass;
  name: string | null;
  quantityMicro: number;
  costBasisCents: number;
  realizedGainCents: number;
  version: number;
}

export interface BrokerCash {
  brokerId: string;
  balanceCents: number;
}

export interface InvestmentMonthRollup {
  month: string;
  depositedCents: number;
  withdrawnCents: number;
  boughtCents: number;
  soldCents: number;
  commissionsCents: number;
  realizedGainCents: number;
}

export type PriceErrorCode = 'NOT_FOUND' | 'UNAVAILABLE' | 'UNSUPPORTED_CURRENCY';

export interface Price {
  ticker: string;
  priceMicros: number | null;
  nativePrice: string | null;
  nativeCurrency: string | null;
  fxRate: string | null;
  instrumentType: string | null;
  name: string | null;
  provider: string | null;
  marketTime: string | null;
  retrievedAt: string | null;
  lastAttemptAt: string | null;
  lastError: PriceErrorCode | null;
  ttl: number | null;
}

// ---------- Ingestion ----------

export type ConnectionStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface Connection {
  id: string;
  type: 'gmail';
  status: ConnectionStatus;
  tokenPrefix: string;
  lastSeenAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface IngestToken {
  tokenHash: string;
  userId: string;
  connectionId: string;
}

export type IngestMessageStatus = 'received' | 'imported' | 'unparsed' | 'rejected';

export interface IngestMessage {
  messageId: string;
  status: IngestMessageStatus;
  reason: string | null;
  templateId: string | null;
  transactionId: string | null;
  rawRef: string;
  receivedAt: string;
  lastRepeatAt?: string | null;
  ttl: number;
}

export type ImportStatus = 'UPLOADING' | 'PROCESSING' | 'DONE' | 'FAILED';

export interface FileClaim {
  fileHash: string;
  importId: string;
  status: ImportStatus;
}

export interface ChecksumResult {
  expectedOutMinor: number;
  expectedInMinor: number;
  actualOutMinor: number;
  actualInMinor: number;
  expectedOutCount?: number;
  expectedInCount?: number;
  actualOutCount?: number;
  actualInCount?: number;
  ok: boolean;
}

export interface RowError {
  line: number;
  reason: string;
}

export interface ImportJob {
  id: string;
  accountId: string;
  fileHash: string;
  fileName: string | null;
  status: ImportStatus;
  failureReason: string | null;
  templateId: string | null;
  statementIban: string | null;
  statementDate: string | null;
  imported: number;
  merged: number;
  skipped: number;
  transfers: number;
  checksum: ChecksumResult | null;
  rowErrors: RowError[];
  createdAt: string;
}

export type Direction = 'out' | 'in';

export interface ParsedTransaction {
  accountId: string | null;
  cardLast4: string | null;
  localDate: string;
  occurredAt: string | null;
  direction: Direction;
  kind: TransactionKind;
  currency: Currency;
  amountMinor: number;
  merchantRaw: string;
  statementRef: string | null;
  bankCode: string | null;
  authorization: string | null;
  source: TransactionSource;
  sourceRef: string | null;
  line: number | null;
}
