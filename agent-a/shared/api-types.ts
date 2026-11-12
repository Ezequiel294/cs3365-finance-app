/**
 * Response shapes exchanged between ApiFn and the Next.js server (ApiClient). Both sides
 * import these, so the UI and the API agree on the contract.
 */
import type {
  AssetClass,
  Broker,
  BrokerCash,
  Budget,
  Category,
  Connection,
  Holding,
  ImportJob,
  IngestMessage,
  Price,
  Tag,
  Transaction,
} from './types';

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
}

export interface Catalog {
  categories: Category[];
  tags: Tag[];
}

export interface DuplicatePair {
  flagged: Transaction;
  existing: Transaction | null;
}

export interface ReviewList {
  uncategorized: Transaction[];
  duplicates: DuplicatePair[];
  unparsed: IngestMessage[];
  count: number;
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

export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
}

export interface ImportStart {
  importId: string;
  upload: PresignedPost;
}

export type IngestOutcome = 'imported' | 'unparsed' | 'rejected' | 'duplicate';

export interface IngestResult {
  status: IngestOutcome;
  reason?: string | null;
  transactionId?: string | null;
}

export interface BudgetProgress {
  budget: Budget;
  periodStart: string;
  periodEnd: string;
  daysLeft: number;
  spentCents: number;
  limitCents: number;
  remainingCents: number;
  percent: number;
  overByCents: number;
  expectedCents: number;
}

export interface BurndownSeries {
  dates: string[];
  cumulativeSpentCents: number[];
  paceCents: number[];
  limitCents: number;
}

export interface CategoryShare {
  categoryId: string;
  name: string;
  expenseCents: number;
  /** Share of the month's spending in basis points (3400 = 34%). */
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

export interface Quote {
  symbol: string;
  name: string | null;
  instrumentType: string | null;
  assetClass: AssetClass;
  currency: string;
  /** USD price as a decimal string. */
  price: string;
  /** Market time (ISO). */
  time: string;
  priceMicros: number;
}

export interface HoldingValue {
  holding: Holding;
  price: Price | null;
  marketValueCents: number | null;
  unrealizedGainCents: number | null;
  gainBps: number | null;
  shareBps: number | null;
  priceTime: string | null;
  stale: boolean;
}

export interface Valuation {
  holdings: HoldingValue[];
  cash: BrokerCash[];
  totalValueCents: number;
  totalCostBasisCents: number;
  unrealizedGainCents: number;
  gainBps: number;
  priceTime: string | null;
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
  grossCents: number;
  sellFeesCents: number;
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

export interface RecordInvestmentResult {
  transaction: import('./types').InvestmentTransaction;
  holding: Holding | null;
  cash: BrokerCash | null;
}

export type { Broker, ImportJob };
