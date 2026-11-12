import type { DuplicatePair, IngestResult, ReviewList } from '../../../shared/api-types';
import { reviewReasonFor } from '../core/transaction-service';
import { ConflictError, NotFoundError } from '../http/errors';
import type { IngestPipeline } from '../ingest/ingest-pipeline';
import { type DynamoStore, failedConditionIndexes } from '../repositories/dynamo-store';
import type { IngestionRepository } from '../repositories/ingestion-repository';
import type { TransactionRepository } from '../repositories/transaction-repository';

/** The review inbox: uncategorized transactions, possible duplicates, emails not understood. */
export class ReviewService {
  constructor(
    private readonly transactions: Pick<TransactionRepository, 'listReview' | 'get' | 'updateItem'>,
    private readonly ingestion: Pick<IngestionRepository, 'listUnparsed' | 'getMessage' | 'deleteMessage'>,
    private readonly pipeline: () => Pick<IngestPipeline, 'processEmail'>,
    private readonly store: Pick<DynamoStore, 'transactWrite'>,
  ) {}

  async list(userId: string): Promise<ReviewList> {
    const [uncategorized, duplicates, unparsed] = await Promise.all([
      this.transactions.listReview(userId, 'UNCATEGORIZED'),
      this.listDuplicates(userId),
      this.ingestion.listUnparsed(userId),
    ]);
    uncategorized.sort((a, b) => b.localDate.localeCompare(a.localDate));
    return {
      uncategorized,
      duplicates,
      unparsed,
      count: uncategorized.length + duplicates.length + unparsed.length,
    };
  }

  async listDuplicates(userId: string): Promise<DuplicatePair[]> {
    const flagged = await this.transactions.listReview(userId, 'DUPLICATE');
    const pairs = await Promise.all(
      flagged.map(async (f) => ({
        flagged: f,
        existing: f.possibleDuplicateOf ? await this.transactions.get(userId, f.possibleDuplicateOf) : null,
      })),
    );
    return pairs.sort((a, b) => b.flagged.localDate.localeCompare(a.flagged.localDate));
  }

  /** "Different purchases, keep both": remove possibleDuplicateOf (and reviewPK if nothing else is pending). */
  async dismiss(userId: string, transactionId: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const txn = await this.transactions.get(userId, transactionId);
      if (!txn) throw new NotFoundError('Transaction not found.');
      if (!txn.possibleDuplicateOf) return;
      const cleared = { ...txn, possibleDuplicateOf: null };
      const reviewReason = reviewReasonFor(cleared);
      const next = {
        ...cleared,
        reviewReason,
        status: reviewReason ? ('pending_review' as const) : ('confirmed' as const),
        version: txn.version + 1,
      };
      try {
        await this.store.transactWrite([this.transactions.updateItem(next, txn.version)]);
        return;
      } catch (e) {
        if (failedConditionIndexes(e)?.length) continue;
        throw e;
      }
    }
    throw new ConflictError('This transaction was changed somewhere else. Reload and try again.');
  }

  /** Process a stored email again once its cause is fixed (01-S08c). */
  async retry(userId: string, messageId: string): Promise<IngestResult> {
    const msg = await this.ingestion.getMessage(userId, messageId);
    if (!msg || msg.status !== 'unparsed') throw new ConflictError('There is nothing to retry for this email.', 'NOTHING_TO_RETRY');
    await this.ingestion.deleteMessage(userId, messageId);
    return this.pipeline().processEmail(userId, messageId, msg.rawRef);
  }
}
