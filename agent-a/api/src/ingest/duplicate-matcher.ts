import type { Currency, Transaction, TransactionSource } from '@finance/shared';
import type { TransactionRepository } from '../repositories/transaction-repository';
import { addDays } from '../services/period-calculator';

export interface DuplicateMatch {
  type: 'exact' | 'near' | 'none';
  existing?: Transaction;
}

export interface MatchInput {
  accountId: string;
  localDate: string;
  amountMinor: number;
  currency: Currency;
  source: TransactionSource;
  statementRef?: string | null;
}

/** A near match differs in amount by at most this fraction (for example a tip added later). */
export const NEAR_TOLERANCE = 0.1;

/**
 * Finds the same purchase arriving by another route. The match key is the
 * original amount, the account, and a date window (the same day: both the
 * statement and the alert give the transaction date). Only transactions from a
 * different source are candidates, so two equal statement rows stay separate.
 */
export class DuplicateMatcher {
  constructor(private readonly transactions: TransactionRepository) {}

  async findMatch(userId: string, parsed: MatchInput): Promise<DuplicateMatch> {
    const days = this.windowFor(parsed.source);
    const candidates = (
      await this.transactions.findNear(userId, parsed.accountId, addDays(parsed.localDate, -days), addDays(parsed.localDate, days))
    ).filter((t) => t.currency === parsed.currency && !(t.sources ?? []).includes(parsed.source));

    const exact = candidates.filter((t) => t.amountMinor === parsed.amountMinor);
    if (exact.length > 0) {
      const byRef = parsed.statementRef ? exact.find((t) => t.statementRef === parsed.statementRef) : undefined;
      return { type: 'exact', existing: byRef ?? exact[0] };
    }
    const near = candidates
      .filter((t) => Math.abs(t.amountMinor - parsed.amountMinor) <= Math.max(t.amountMinor, parsed.amountMinor) * NEAR_TOLERANCE)
      .sort((a, b) => Math.abs(a.amountMinor - parsed.amountMinor) - Math.abs(b.amountMinor - parsed.amountMinor));
    if (near.length > 0) return { type: 'near', existing: near[0] };
    return { type: 'none' };
  }

  /** Days either side of the transaction date that are searched: the same day for every source. */
  private windowFor(source: TransactionSource): number {
    const WINDOW_DAYS: Record<TransactionSource, number> = { csv: 0, gmail: 0, manual: 0 };
    return WINDOW_DAYS[source];
  }
}
