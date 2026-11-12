import { addDays, diffDays } from '../../../shared/dates';
import { isMoneyIn } from '../../../shared/kinds';
import type { ParsedTransaction, Transaction, TransactionSource } from '../../../shared/types';
import type { TransactionRepository } from '../repositories/transaction-repository';

export interface DuplicateMatch {
  type: 'exact' | 'near' | 'none';
  existing: Transaction | null;
}

/**
 * Finds the same purchase arriving by another route (an email and a statement row).
 * Exact: same account, currency, direction, and original amount within the date window
 * (or the same bank reference). Near: same account and day, amount within 10%.
 */
export class DuplicateMatcher {
  constructor(private readonly transactions: Pick<TransactionRepository, 'findNear'>) {}

  async findMatch(
    userId: string,
    parsed: Pick<
      ParsedTransaction,
      'accountId' | 'localDate' | 'amountMinor' | 'currency' | 'direction' | 'statementRef' | 'source'
    >,
  ): Promise<DuplicateMatch> {
    if (!parsed.accountId) return { type: 'none', existing: null };
    const w = this.windowFor(parsed.source);
    const candidates = (
      await this.transactions.findNear(
        userId,
        parsed.accountId,
        addDays(parsed.localDate, -w),
        addDays(parsed.localDate, w),
      )
    ).filter(
      (t) =>
        !t.sources.includes(parsed.source) &&
        t.currency === parsed.currency &&
        isMoneyIn(t.kind) === (parsed.direction === 'in'),
    );
    const exact = candidates
      .filter((t) => t.amountMinor === parsed.amountMinor)
      .sort((a, b) => {
        const refA = parsed.statementRef && a.statementRef === parsed.statementRef ? 0 : 1;
        const refB = parsed.statementRef && b.statementRef === parsed.statementRef ? 0 : 1;
        if (refA !== refB) return refA - refB;
        return (
          Math.abs(diffDays(a.localDate, parsed.localDate)) - Math.abs(diffDays(b.localDate, parsed.localDate))
        );
      })[0];
    if (exact) return { type: 'exact', existing: exact };
    const near = candidates.find(
      (t) =>
        t.localDate === parsed.localDate &&
        Math.abs(t.amountMinor - parsed.amountMinor) * 10 <= Math.max(t.amountMinor, parsed.amountMinor),
    );
    if (near) return { type: 'near', existing: near };
    return { type: 'none', existing: null };
  }

  /** Days either side of the date. A statement prints the posting date, which can trail the purchase. */
  private windowFor(source: TransactionSource): number {
    return source === 'manual' ? 0 : 3;
  }
}
