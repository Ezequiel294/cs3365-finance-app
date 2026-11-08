import { z } from "zod";

export const CURRENCIES = ["USD", "CRC"] as const;
export const Currency = z.enum(CURRENCIES);
export type Currency = z.infer<typeof Currency>;

export const TRANSACTION_KINDS = [
  "purchase",
  "refund",
  "income",
  "sinpe_sent",
  "sinpe_received",
  "transfer",
  "card_payment",
] as const;
export const TransactionKind = z.enum(TRANSACTION_KINDS);
export type TransactionKind = z.infer<typeof TransactionKind>;

export const TransactionStatus = z.enum(["confirmed", "pending_review"]);
export type TransactionStatus = z.infer<typeof TransactionStatus>;

export const TransactionSource = z.enum(["manual", "gmail", "csv"]);
export type TransactionSource = z.infer<typeof TransactionSource>;

export const BUDGET_PERIODS = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"] as const;
export const BudgetPeriod = z.enum(BUDGET_PERIODS);
export type BudgetPeriod = z.infer<typeof BudgetPeriod>;

export const INVESTMENT_TYPES = ["DEPOSIT", "WITHDRAWAL", "BUY", "SELL"] as const;
export const InvestmentType = z.enum(INVESTMENT_TYPES);
export type InvestmentType = z.infer<typeof InvestmentType>;

export const WEEK_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export const WeekStart = z.enum(WEEK_DAYS);
export type WeekStart = z.infer<typeof WeekStart>;

/** Who set a transaction's category. */
export type CategorizedBy = "user" | "rule" | "global" | "none";

/** Kinds that never enter expense rollups or budgets. */
export const NON_SPENDING_KINDS: readonly TransactionKind[] = ["income", "transfer", "card_payment"];

/**
 * `Transaction.countsAsSpending()` from the class diagram, as a function so both
 * the web app and the API can use it on plain JSON records.
 */
export function countsAsSpending(kind: TransactionKind): boolean {
  return !NON_SPENDING_KINDS.includes(kind);
}

/**
 * Sign of a spending kind in expense totals. Refunds and money received over
 * SINPE reduce spending; purchases and SINPE payments add to it.
 */
export function expenseSign(kind: TransactionKind): 1 | -1 | 0 {
  if (!countsAsSpending(kind)) return 0;
  return kind === "refund" || kind === "sinpe_received" ? -1 : 1;
}

export const UNCATEGORIZED_ID = "uncategorized";
