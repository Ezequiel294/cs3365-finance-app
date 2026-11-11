import type { Transaction } from '@finance/shared';
import type { TransactionRepository } from '../repositories/transaction-repository';

export interface TransactionFilter {
  accountId?: string;
  status?: 'confirmed' | 'pending_review';
}

export class TransactionQueryService {
  constructor(private readonly transactions: TransactionRepository) {}

  /** Transactions between two dates (inclusive), newest first. */
  async list(userId: string, from: string, to: string, filter: TransactionFilter = {}): Promise<Transaction[]> {
    const all = await this.transactions.listByDate(userId, from, to);
    return all
      .filter((t) => (!filter.accountId || t.accountId === filter.accountId) && (!filter.status || t.status === filter.status))
      .sort((a, b) => (a.localDate === b.localDate ? (a.createdAt < b.createdAt ? 1 : -1) : a.localDate < b.localDate ? 1 : -1));
  }
}
