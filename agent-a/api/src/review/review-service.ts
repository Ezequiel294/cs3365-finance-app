import type { DuplicatePair, ReviewList, Transaction } from "@finance/shared";
import { NotFoundError, ValidationError } from "../http/errors";
import type { DynamoStore } from "../repositories/dynamo-store";
import type { IngestionRepository } from "../repositories/ingestion-repository";
import type { TransactionRepository } from "../repositories/transaction-repository";
import { reviewReasonOf } from "../transactions/transaction-service";

/** The review inbox: uncategorized transactions, possible duplicates, and emails no template could read. */
export class ReviewService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly ingestion: IngestionRepository,
    private readonly store: DynamoStore,
  ) {}

  async list(userId: string): Promise<ReviewList> {
    const [pending, unparsed] = await Promise.all([this.transactions.listReview(userId), this.ingestion.listUnparsed(userId)]);
    const uncategorized = pending.filter((t) => t.status === "pending_review" && !t.possibleDuplicateOf);
    const duplicates = await this.pairs(userId, pending.filter((t) => t.possibleDuplicateOf));
    return { uncategorized, duplicates, unparsed, count: pending.length + unparsed.length };
  }

  async listDuplicates(userId: string): Promise<DuplicatePair[]> {
    return this.pairs(userId, await this.transactions.listReview(userId, "DUPLICATE"));
  }

  /** "Keep both": clears the duplicate flag. The pair is not proposed again. */
  async dismiss(userId: string, transactionId: string): Promise<void> {
    const txn = await this.transactions.get(userId, transactionId);
    if (!txn) throw new NotFoundError("transaction not found");
    if (!txn.possibleDuplicateOf) throw new ValidationError("this transaction is not flagged as a possible duplicate");
    const next: Transaction = { ...txn, possibleDuplicateOf: undefined, version: txn.version + 1 };
    next.reviewReason = reviewReasonOf(next);
    await this.store.transactWrite([this.transactions.updateItem(next, txn.version)]);
  }

  private async pairs(userId: string, flagged: Transaction[]): Promise<DuplicatePair[]> {
    return Promise.all(
      flagged.map(async (transaction) => ({
        transaction,
        other: transaction.possibleDuplicateOf ? await this.transactions.get(userId, transaction.possibleDuplicateOf) : undefined,
      })),
    );
  }
}
