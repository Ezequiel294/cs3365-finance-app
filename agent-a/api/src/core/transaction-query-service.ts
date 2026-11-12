import type { Transaction } from '../../../shared/types';
import type { TransactionRepository } from '../repositories/transaction-repository';

export interface TransactionFilter {
  accountId?: string;
}

export class TransactionQueryService {
  constructor(private readonly transactions: Pick<TransactionRepository, 'listByDate'>) {}

  /** Transactions between two dates, newest first. */
  async list(userId: string, from: string, to: string, filter: TransactionFilter = {}): Promise<Transaction[]> {
    const items = await this.transactions.listByDate(userId, from, to);
    return items
      .filter((t) => !filter.accountId || t.accountId === filter.accountId)
      .sort((a, b) =>
        a.localDate === b.localDate
          ? (b.occurredAt ?? b.createdAt).localeCompare(a.occurredAt ?? a.createdAt)
          : b.localDate.localeCompare(a.localDate),
      );
  }
}
