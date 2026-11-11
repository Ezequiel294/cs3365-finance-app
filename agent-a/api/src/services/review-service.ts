import type { DuplicatePair, IngestResult, ReviewList } from '@finance/shared';
import { ConflictError, NotFoundError } from '../errors';
import type { IngestPipeline } from '../ingest/ingest-pipeline';
import type { IngestionRepository } from '../repositories/ingestion-repository';
import type { TransactionRepository } from '../repositories/transaction-repository';
import type { TransactionService } from './transaction-service';

/** The review inbox: uncategorized transactions, possible duplicates, and emails not understood. */
export class ReviewService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly ingestion: IngestionRepository,
    private readonly pipeline: IngestPipeline,
    private readonly transactionService: TransactionService,
  ) {}

  async list(userId: string): Promise<ReviewList> {
    const [pending, unparsed] = await Promise.all([this.transactions.listReview(userId), this.ingestion.listUnparsed(userId)]);
    const uncategorized = pending.filter((t) => t.status === 'pending_review' && !t.possibleDuplicateOf);
    const duplicates = await this.pairs(userId, pending.filter((t) => !!t.possibleDuplicateOf));
    return {
      uncategorized: uncategorized.sort((a, b) => (a.localDate < b.localDate ? 1 : -1)),
      duplicates,
      unparsed: unparsed.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1)),
      count: uncategorized.length + duplicates.length + unparsed.length,
    };
  }

  async listDuplicates(userId: string): Promise<DuplicatePair[]> {
    return this.pairs(userId, await this.transactions.listReview(userId, 'DUPLICATE'));
  }

  private async pairs(userId: string, flagged: Awaited<ReturnType<TransactionRepository['listReview']>>): Promise<DuplicatePair[]> {
    return Promise.all(
      flagged.map(async (transaction) => ({
        transaction,
        existing: transaction.possibleDuplicateOf ? (await this.transactions.get(userId, transaction.possibleDuplicateOf)) ?? null : null,
      })),
    );
  }

  /** "Not duplicates": removes `possibleDuplicateOf` and the review flag. */
  async dismiss(userId: string, transactionId: string): Promise<void> {
    await this.transactionService.dismissDuplicate(userId, transactionId);
  }

  /** Processes a stored email again once its cause is fixed (01-S08c). */
  async retry(userId: string, messageId: string): Promise<IngestResult> {
    const message = await this.ingestion.getMessage(userId, messageId);
    if (!message) throw new NotFoundError('Message not found');
    if (message.status !== 'unparsed') throw new ConflictError('Nothing to retry');
    await this.ingestion.deleteMessage(userId, messageId);
    return this.pipeline.processEmail(userId, messageId, message.rawRef);
  }
}
