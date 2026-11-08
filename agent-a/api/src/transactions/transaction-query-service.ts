import type { Transaction } from "@finance/shared";
import { ValidationError } from "../http/errors";
import { daysBetween } from "../dates";
import type { TransactionRepository } from "../repositories/transaction-repository";

export interface TransactionFilter {
  accountId?: string;
  categoryId?: string;
  tagId?: string;
}

const MAX_RANGE_DAYS = 366;

export class TransactionQueryService {
  constructor(private readonly transactions: TransactionRepository) {}

  /** Transactions in a date range, newest first. Each keeps its original currency and amount next to the USD figure. */
  async list(userId: string, from: string, to: string, filter: TransactionFilter = {}): Promise<Transaction[]> {
    if (from > to) throw new ValidationError("from must not be after to");
    if (daysBetween(from, to) > MAX_RANGE_DAYS) throw new ValidationError("the range can cover at most one year");
    const items = await this.transactions.listByDate(userId, from, to);
    return items
      .filter((t) => !filter.accountId || t.accountId === filter.accountId)
      .filter((t) => !filter.categoryId || (t.categoryId ?? "uncategorized") === filter.categoryId)
      .filter((t) => !filter.tagId || t.tagIds.includes(filter.tagId))
      .sort((a, b) => (a.localDate === b.localDate ? b.createdAt.localeCompare(a.createdAt) : b.localDate.localeCompare(a.localDate)));
  }
}
