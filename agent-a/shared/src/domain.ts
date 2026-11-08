import type {
  BudgetPeriod,
  CategorizedBy,
  Currency,
  InvestmentType,
  TransactionKind,
  TransactionSource,
  TransactionStatus,
  WeekStart,
} from "./enums";

/** Money is integer minor units. `amountMinor` is in the original currency; `...Cents` fields are USD cents. */
export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  localDate: string;
  occurredAt?: string;
  kind: TransactionKind;
  status: TransactionStatus;
  currency: Currency;
  amountMinor: number;
  amountUsdCents: number;
  fxRate: number;
  fxDate: string;
  categoryId?: string;
  tagIds: string[];
  categorizedBy: CategorizedBy;
  merchantRaw?: string;
  merchantKey?: string;
  note?: string;
  sources: TransactionSource[];
  statementRef?: string;
  possibleDuplicateOf?: string;
  reviewReason?: ReviewReason;
  createdAt: string;
  version: number;
}

export type ReviewReason = "UNCATEGORIZED" | "DUPLICATE";

export interface Account {
  id: string;
  bank: string;
  type: string;
  currency: Currency;
  last4?: string;
  name: string;
}

export interface UserSettings {
  userId: string;
  timeZone: string;
  weekStart: WeekStart;
  baseCurrency: "USD";
}

export type Scope = "GLOBAL" | "USER";

export interface Category {
  id: string;
  name: string;
  scope: Scope;
  archived: boolean;
}

export interface Tag {
  id: string;
  name: string;
  scope: Scope;
  archived: boolean;
}

export interface Rule {
  merchantKey: string;
  categoryId: string;
  tagIds: string[];
  scope: Scope;
}

export interface Budget {
  id: string;
  name: string;
  categoryIds: string[];
  tagIds: string[];
  period: BudgetPeriod;
  limitCents: number;
  startDate?: string;
  endDate?: string;
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

export type RollupDimension = "TOTAL" | "CAT" | "TAG";

export interface SpendingRollup {
  bucket: string;
  dimension: RollupDimension;
  dimensionId?: string;
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

export interface InvestmentTransaction {
  id: string;
  userId: string;
  brokerId: string;
  type: InvestmentType;
  localDate: string;
  ticker?: string;
  quantityMicro?: number;
  grossCents?: number;
  amountCents?: number;
  commissionCents: number;
  realizedGainCents?: number;
  name?: string;
  createdAt: string;
  version: number;
}

export interface Broker {
  id: string;
  name: string;
  flatCents: number;
  percentBps: number;
  version: number;
}

export interface Holding {
  brokerId: string;
  ticker: string;
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

export interface Price {
  ticker: string;
  priceCents: number;
  retrievedAt: string;
  stale: boolean;
}

export type ConnectionStatus = "PENDING" | "ACTIVE" | "REVOKED";

export interface Connection {
  id: string;
  type: "gmail";
  status: ConnectionStatus;
  tokenPrefix?: string;
  createdAt: string;
  lastSeenAt?: string;
  stale?: boolean;
}

export interface IngestToken {
  tokenHash: string;
  userId: string;
  connectionId: string;
}

export type IngestMessageStatus = "received" | "rejected" | "unparsed" | "imported" | "duplicate";

export interface IngestMessage {
  messageId: string;
  status: IngestMessageStatus;
  templateId?: string;
  transactionId?: string;
  rawRef?: string;
  subject?: string;
  sender?: string;
  reason?: string;
  receivedAt: string;
  ttl?: number;
}

export type ImportStatus = "UPLOADING" | "PROCESSING" | "DONE" | "FAILED";

export interface RowError {
  row: number;
  reason: string;
}

export interface ImportJob {
  id: string;
  accountId: string;
  fileHash: string;
  fileName?: string;
  status: ImportStatus;
  templateId?: string;
  imported: number;
  merged: number;
  skipped: number;
  rowErrors: RowError[];
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** What a bank template produces, before currency conversion, duplicate matching, and categorization. */
export interface ParsedTransaction {
  accountLast4?: string;
  localDate: string;
  occurredAt?: string;
  kind: TransactionKind;
  currency?: Currency;
  amountMinor: number;
  merchantRaw?: string;
  statementRef?: string;
  source: TransactionSource;
  sourceRef?: string;
}
