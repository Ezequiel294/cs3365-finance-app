import type {
  Account,
  Budget,
  Category,
  Connection,
  Holding,
  ImportJob,
  IngestMessage,
  Price,
  Tag,
  Transaction,
} from "./domain";

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
}

export interface ImportStart {
  importId: string;
  upload: PresignedPost;
  maxBytes: number;
}

export interface DuplicatePair {
  transaction: Transaction;
  other?: Transaction;
}

export interface ReviewList {
  uncategorized: Transaction[];
  duplicates: DuplicatePair[];
  unparsed: IngestMessage[];
  count: number;
}

export interface GmailSetup {
  connectionId: string;
  /** Shown once. Never stored or logged by the product. */
  token: string;
  script: string;
}

export interface IngestConfig {
  senders: string[];
  label: string;
}

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
  categoryId: string;
  name: string;
  expenseCents: number;
  share: number;
}

export interface TagTotal {
  tagId: string;
  name: string;
  expenseCents: number;
  budgetLimitCents?: number;
}

export interface MonthTotal {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

export interface HoldingValue {
  holding: Holding;
  price?: Price;
  marketValueCents?: number;
}

export interface Valuation {
  holdings: HoldingValue[];
  totalValueCents: number;
  /** True when at least one holding has no price, so the total leaves it out. */
  incomplete: boolean;
}

export interface HoldingExit {
  brokerId: string;
  ticker: string;
  quantityMicro: number;
  costBasisCents: number;
  marketValueCents?: number;
  sellCommissionCents?: number;
  netCents?: number;
  unrealizedGainCents?: number;
  priceAvailable: boolean;
  stale: boolean;
}

export interface Liquidation {
  holdings: HoldingExit[];
  cash: { brokerId: string; balanceCents: number }[];
  cashCents: number;
  totalCents: number;
  /** Oldest price time used, ISO. */
  priceTime?: string;
  incomplete: boolean;
}

export interface ReferenceData {
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
}

export type ConnectionList = Connection[];
export type ImportJobResponse = ImportJob;
