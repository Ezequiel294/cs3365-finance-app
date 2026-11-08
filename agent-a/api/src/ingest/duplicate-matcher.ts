import type { Transaction, TransactionSource } from "@finance/shared";
import { addDays, daysBetween } from "../dates";
import type { TransactionRepository } from "../repositories/transaction-repository";
import type { ResolvedParsed } from "../transactions/transaction-service";

export interface DuplicateMatch {
  type: "exact" | "near" | "none";
  existing?: Transaction;
}

/** Amounts within this fraction of each other on the same day are proposed as near duplicates. */
const NEAR_AMOUNT_TOLERANCE = 0.05;

/**
 * Matches an incoming transaction against ones already saved from another source.
 * - exact: same account, currency, kind, original amount, and day → merged automatically.
 * - near: same account and currency inside the date window with a close amount, or the same
 *   amount on a nearby day → saved with `possibleDuplicateOf` for the user to decide.
 * Transactions from the same source are never matched: each source has its own idempotency key.
 */
export class DuplicateMatcher {
  constructor(private readonly transactions: TransactionRepository) {}

  async findMatch(userId: string, parsed: ResolvedParsed): Promise<DuplicateMatch> {
    const window = this.windowFor(parsed.source);
    const candidates = (
      await this.transactions.findNear(userId, parsed.accountId, addDays(parsed.localDate, -window), addDays(parsed.localDate, window))
    ).filter((t) => !t.sources.includes(parsed.source) && t.currency === parsed.currency);

    const exact = candidates.find(
      (t) => t.localDate === parsed.localDate && t.amountMinor === parsed.amountMinor && t.kind === parsed.kind,
    );
    if (exact) return { type: "exact", existing: exact };

    const near = candidates
      .filter((t) => {
        const sameDay = t.localDate === parsed.localDate;
        const closeAmount = Math.abs(t.amountMinor - parsed.amountMinor) <= Math.round(Math.max(t.amountMinor, parsed.amountMinor) * NEAR_AMOUNT_TOLERANCE);
        return (sameDay && closeAmount) || t.amountMinor === parsed.amountMinor;
      })
      .sort((a, b) => Math.abs(daysBetween(a.localDate, parsed.localDate)) - Math.abs(daysBetween(b.localDate, parsed.localDate)))[0];
    if (near) return { type: "near", existing: near };
    return { type: "none" };
  }

  /** Days either side of the date to look for near matches. Statements give the transaction date, so their window is tighter. */
  private windowFor(source: TransactionSource): number {
    return source === "csv" ? 1 : 2;
  }
}
