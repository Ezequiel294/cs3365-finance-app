/**
 * Domain types shared by the Next.js app and the API (class diagram, section 1).
 * Money is integer minor units; fields ending in `Cents` are USD cents.
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
export type ReviewReason = 'DUPLICATE' | 'UNCATEGORIZED';

export const BUDGET_PERIODS = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

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
  statementRef?: string | null;
  authorization?: string | null;
  possibleDuplicateOf?: string | null;
  reviewReason?: ReviewReason | null;
  note?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  name: string;
  bank: Bank;
  type: string;
  currency: Currency;
  iban?: string | null;
  cardLast4s: string[];
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
  scope: 'GLOBAL' | 'USER';
  archived: boolean;
}

export interface Tag {
  id: string;
  name: string;
  scope: 'GLOBAL' | 'USER';
  archived: boolean;
}

export interface Rule {
  merchantKey: string;
  categoryId: string | null;
  tagIds: string[];
  kind?: TransactionKind | null;
  scope: 'GLOBAL' | 'USER';
}

export interface Budget {
  id: string;
  name: string;
  categoryIds: string[];
  tagIds: string[];
  period: BudgetPeriod;
  limitCents: number;
  startDate?: string | null;
  endDate?: string | null;
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
  dimensionId: string | null;
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

// ---------- Ingestion ----------

export type ImportStatus = 'UPLOADING' | 'PROCESSING' | 'DONE' | 'FAILED';

export interface ChecksumResult {
  expectedOutMinor: number;
  expectedInMinor: number;
  actualOutMinor: number;
  actualInMinor: number;
  expectedOutCount?: number | null;
  expectedInCount?: number | null;
  actualOutCount: number;
  actualInCount: number;
  ok: boolean;
}

export interface RowError {
  line: number;
  reason: string;
}

export interface ImportJob {
  id: string;
  accountId: string;
  fileName?: string | null;
  fileHash: string;
  status: ImportStatus;
  failureReason?: string | null;
  templateId?: string | null;
  statementIban?: string | null;
  statementDate?: string | null;
  imported: number;
  merged: number;
  skipped: number;
  transfers: number;
  checksum?: ChecksumResult | null;
  rowErrors: RowError[];
  createdAt: string;
  updatedAt: string;
}

export interface ImportStart {
  importId: string;
  upload: { url: string; fields: Record<string, string> };
  maxBytes: number;
}

export type ConnectionStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface Connection {
  id: string;
  type: 'gmail';
  status: ConnectionStatus;
  tokenPrefix: string;
  lastSeenAt?: string | null;
  createdAt: string;
}

export interface DeliveryStats {
  imported: number;
  unparsed: number;
  rejected: number;
  duplicate: number;
}

export interface ConnectionView {
  connection: Connection;
  stale: boolean;
  lastSevenDays: DeliveryStats;
}

export interface GmailSetup {
  connectionId: string;
  token: string;
  script: string;
}

export type MessageStatus = 'processing' | 'imported' | 'duplicate' | 'unparsed' | 'rejected';

export interface IngestMessage {
  messageId: string;
  status: MessageStatus;
  reason?: string | null;
  templateId?: string | null;
  transactionId?: string | null;
  rawRef: string;
  receivedAt: string;
  subject?: string | null;
  ttl?: number;
}

export interface IngestResult {
  status: MessageStatus;
  reason?: string | null;
  transactionId?: string | null;
}

export interface DuplicatePair {
  transaction: Transaction;
  existing: Transaction | null;
}

export interface ReviewList {
  uncategorized: Transaction[];
  duplicates: DuplicatePair[];
  unparsed: IngestMessage[];
  count: number;
}

// ---------- Budgets & analytics ----------

export interface BudgetProgress {
  budget: Budget;
  periodStart: string;
  periodEnd: string;
  spentCents: number;
  limitCents: number;
  remainingCents: number;
  percent: number;
  overByCents: number;
}

export interface BurndownSeries {
  budgetId: string;
  periodStart: string;
  periodEnd: string;
  limitCents: number;
  dates: string[];
  cumulativeSpentCents: number[];
  paceCents: number[];
}

export interface CategoryShare {
  categoryId: string | null;
  name: string;
  expenseCents: number;
  share: number;
}

export interface TagTotal {
  tagId: string;
  name: string;
  expenseCents: number;
  budgetLimitCents: number | null;
}

export interface MonthTotal {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

// ---------- Investments ----------

export const INVESTMENT_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'BUY', 'SELL'] as const;
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];
export const ASSET_CLASSES = ['SECURITY', 'CRYPTO'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];
export type CommissionSource = 'rule' | 'manual';

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

export interface InvestmentTransaction {
  id: string;
  userId: string;
  brokerId: string;
  type: InvestmentType;
  localDate: string;
  ticker?: string | null;
  assetClass?: AssetClass | null;
  quantityMicro?: number | null;
  grossCents?: number | null;
  amountCents?: number | null;
  commissionCents: number;
  commissionSource: CommissionSource;
  realizedGainCents?: number | null;
  name?: string | null;
  version: number;
  createdAt: string;
}

export interface Holding {
  brokerId: string;
  ticker: string;
  assetClass: AssetClass;
  name?: string | null;
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
  priceMicros?: number | null;
  nativePrice?: string | null;
  nativeCurrency?: string | null;
  fxRate?: string | null;
  instrumentType?: string | null;
  name?: string | null;
  provider?: string | null;
  marketTime?: string | null;
  retrievedAt?: string | null;
  lastAttemptAt?: string | null;
  lastError?: PriceErrorCode | null;
  ttl?: number;
}

export interface Quote {
  symbol: string;
  name: string;
  instrumentType: string;
  assetClass: AssetClass;
  currency: string;
  price: string;
  time: string;
  priceMicros?: number;
}

export interface HoldingValue {
  holding: Holding;
  price: Price | null;
  marketValueCents: number | null;
  stale: boolean;
}

export interface Valuation {
  holdings: HoldingValue[];
  cash: BrokerCash[];
  totalValueCents: number;
  unpriced: string[];
}

export interface HoldingExit {
  ticker: string;
  marketValueCents: number;
  sellFeeCents: number;
  sellFeeExplained: string;
  netCents: number;
  unrealizedGainCents: number;
}

export interface BrokerExit {
  brokerId: string;
  brokerName: string;
  holdings: HoldingExit[];
  cashCents: number;
  proceedsCents: number;
  withdrawalFeeCents: number;
  withdrawalFeeExplained: string;
  netToBankCents: number;
  negativeCash: boolean;
}

export interface Liquidation {
  brokers: BrokerExit[];
  totalCents: number;
  priceTime: string | null;
  unpriced: string[];
}

export interface FeeSuggestion {
  commissionCents: number;
  netCents: number;
  explanation: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
