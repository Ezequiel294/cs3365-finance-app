import { flowOf } from '../../../shared/kinds';
import type { NewTransaction, TransactionChanges } from '../../../shared/schemas';
import type {
  Budget,
  ReviewReason,
  Transaction,
  TransactionKind,
  TransactionSource,
  UsdConversion,
  WeekDay,
} from '../../../shared/types';
import type { BudgetMatcher } from '../budgets/budget-matcher';
import type { Categorization, Categorizer } from '../categorization/categorizer';
import type { Normalizer } from '../categorization/normalizer';
import type { Clock } from '../clock';
import type { FxService } from '../fx/fx-service';
import {
  AlreadyClaimedError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../http/errors';
import { datedId } from '../ids';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import { type DynamoStore, type TransactItem, failedConditionIndexes } from '../repositories/dynamo-store';
import type { ReferenceRepository } from '../repositories/reference-repository';
import type { TransactionRepository } from '../repositories/transaction-repository';
import { type RollupDelta, type RollupPlanner, mergeDeltas } from './rollup-planner';

/** What a source hands to `save`: a parsed transaction resolved to an account. */
export interface TransactionDraft {
  accountId: string;
  localDate: string;
  occurredAt: string | null;
  kind: TransactionKind;
  currency: Transaction['currency'];
  amountMinor: number;
  merchantRaw: string;
  merchantKey?: string;
  statementRef: string | null;
  sources: TransactionSource[];
  possibleDuplicateOf?: string | null;
  usd?: UsdConversion;
}

/** The incoming side of a pipeline merge (01-S08b): fields not yet saved. */
export interface MergeIncoming {
  draft: TransactionDraft;
  categorization: Categorization;
}

export type Actor = 'user' | 'system';

class VersionConflict extends Error {}

export interface TransactionServiceDeps {
  fx: Pick<FxService, 'toUsd'>;
  normalizer: Normalizer;
  categorizer: Pick<Categorizer, 'categorize'>;
  budgetMatcher: BudgetMatcher;
  planner: RollupPlanner;
  reference: Pick<ReferenceRepository, 'listBudgets' | 'getAccount' | 'getCategories' | 'getTags' | 'getSettings'>;
  transactions: Pick<TransactionRepository, 'get' | 'putItem' | 'updateItem' | 'deleteItem'>;
  aggregates: Pick<AggregateRepository, 'addItems'>;
  store: Pick<DynamoStore, 'transactWrite'>;
  clock: Clock;
}

/** Whether a transaction needs a decision, and why. */
export function reviewReasonFor(
  txn: Pick<Transaction, 'possibleDuplicateOf' | 'categoryId' | 'kind'>,
): ReviewReason | null {
  if (txn.possibleDuplicateOf) return 'DUPLICATE';
  // Transfers and card payments never count, so they do not wait for a category.
  if (!txn.categoryId && flowOf(txn.kind) !== 'excluded') return 'UNCATEGORIZED';
  return null;
}

function withReview(txn: Transaction): Transaction {
  const reviewReason = reviewReasonFor(txn);
  return { ...txn, reviewReason, status: reviewReason ? 'pending_review' : 'confirmed' };
}

/**
 * The single save path: convert to USD, match budgets, then one TransactWriteItems that
 * writes the transaction and every rollup it affects. Edits subtract the old contribution
 * and add the new one in the same call, guarded by `version`.
 */
export class TransactionService {
  constructor(private readonly d: TransactionServiceDeps) {}

  /** Manual entry (01-S03, 01-S05): categorizes itself; keeps the kind the user picked. */
  async create(userId: string, input: NewTransaction): Promise<Transaction> {
    const account = await this.d.reference.getAccount(userId, input.accountId);
    if (!account) throw new ValidationError('Choose one of your accounts.', { accountId: 'Unknown account' });
    const tagIds = [...new Set(input.tagIds ?? [])];
    if (input.categoryId) await this.assertCategory(userId, input.categoryId);
    if (tagIds.length) await this.assertTags(userId, tagIds);

    const usd = await this.d.fx.toUsd(input.amountMinor, input.currency, input.localDate);
    const merchantKey = this.d.normalizer.normalize(input.merchantRaw);
    let categorization: Categorization;
    if (input.categoryId) {
      categorization = { categoryId: input.categoryId, tagIds, kind: null, categorizedBy: 'user', status: 'confirmed' };
    } else {
      const auto = await this.d.categorizer.categorize(userId, merchantKey);
      categorization = { ...auto, kind: null, tagIds: tagIds.length ? tagIds : auto.tagIds };
    }
    return this.save(
      userId,
      {
        accountId: account.id,
        localDate: input.localDate,
        occurredAt: null,
        kind: input.kind,
        currency: input.currency,
        amountMinor: input.amountMinor,
        merchantRaw: input.merchantRaw,
        merchantKey,
        statementRef: null,
        sources: ['manual'],
        usd,
      },
      categorization,
      [],
    );
  }

  /** Called by IngestPipeline with a categorization it already did. */
  async save(
    userId: string,
    draft: TransactionDraft,
    categorization: Categorization,
    extraItems: TransactItem[] = [],
  ): Promise<Transaction> {
    const usd = draft.usd ?? (await this.d.fx.toUsd(draft.amountMinor, draft.currency, draft.localDate));
    const txn = withReview({
      id: datedId(draft.localDate),
      userId,
      accountId: draft.accountId,
      localDate: draft.localDate,
      occurredAt: draft.occurredAt,
      kind: categorization.kind ?? draft.kind,
      status: 'confirmed',
      currency: draft.currency,
      amountMinor: draft.amountMinor,
      amountUsdCents: usd.amountUsdCents,
      fxRate: usd.fxRate,
      fxDate: usd.fxDate,
      categoryId: categorization.categoryId,
      tagIds: categorization.tagIds ?? [],
      categorizedBy: categorization.categoryId ? categorization.categorizedBy : 'none',
      merchantRaw: draft.merchantRaw,
      merchantKey: draft.merchantKey ?? this.d.normalizer.normalize(draft.merchantRaw),
      sources: [...new Set(draft.sources)],
      statementRef: draft.statementRef,
      possibleDuplicateOf: draft.possibleDuplicateOf ?? null,
      reviewReason: null,
      version: 1,
      createdAt: this.d.clock.now().toISOString(),
    });
    try {
      await this.write(userId, [{ old: null, next: txn }], extraItems);
    } catch (e) {
      if (e instanceof VersionConflict) throw new ConflictError('This transaction already exists.');
      throw e;
    }
    return txn;
  }

  /** Category, tag, and kind changes (02-S02, 02-S05, 02-S06). Retries once on a version race. */
  async update(userId: string, id: string, changes: TransactionChanges, actor: Actor = 'user'): Promise<Transaction> {
    if (changes.categoryId) await this.assertCategory(userId, changes.categoryId);
    const tagIds = changes.tagIds ? [...new Set(changes.tagIds)] : undefined;
    if (tagIds?.length) await this.assertTags(userId, tagIds);

    for (let attempt = 0; attempt < 2; attempt++) {
      const old = await this.d.transactions.get(userId, id);
      if (!old) throw new NotFoundError('Transaction not found.');
      const next: Transaction = withReview({
        ...old,
        categoryId: changes.categoryId !== undefined ? changes.categoryId : old.categoryId,
        tagIds: tagIds ?? old.tagIds,
        kind: changes.kind ?? old.kind,
        categorizedBy:
          changes.categoryId !== undefined && actor === 'user'
            ? changes.categoryId
              ? 'user'
              : 'none'
            : old.categorizedBy,
        version: old.version + 1,
      });
      try {
        await this.write(userId, [{ old, next }], []);
        return next;
      } catch (e) {
        if (e instanceof VersionConflict) continue;
        throw e;
      }
    }
    throw new ConflictError('This transaction was changed somewhere else. Reload and try again.');
  }

  /**
   * Merge `drop` into `keepId`. `drop` is either a stored transaction's id (01-S04) or an
   * incoming email or statement row that exactly matches the stored one (01-S08b, 01-S02).
   * A category the user set is never replaced.
   */
  async merge(
    userId: string,
    keepId: string,
    drop: string | MergeIncoming,
    extraItems: TransactItem[] = [],
  ): Promise<Transaction> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const keep = await this.d.transactions.get(userId, keepId);
      if (!keep) throw new NotFoundError('Transaction not found.');
      let other: Transaction;
      let dropTxn: Transaction | null = null;
      if (typeof drop === 'string') {
        if (drop === keepId) throw new ValidationError('Choose two different transactions.');
        dropTxn = await this.d.transactions.get(userId, drop);
        if (!dropTxn) throw new NotFoundError('Transaction not found.');
        other = dropTxn;
      } else {
        other = this.incomingAsTransaction(userId, drop);
      }
      const next = withReview(combine(keep, other));
      const changes: Array<{ old: Transaction | null; next: Transaction | null }> = [{ old: keep, next }];
      if (dropTxn) changes.push({ old: dropTxn, next: null });
      try {
        await this.write(userId, changes, extraItems);
        return next;
      } catch (e) {
        if (e instanceof VersionConflict) continue;
        throw e;
      }
    }
    throw new ConflictError('These transactions were changed somewhere else. Reload and try again.');
  }

  private incomingAsTransaction(userId: string, incoming: MergeIncoming): Transaction {
    const { draft, categorization } = incoming;
    return {
      id: 'incoming',
      userId,
      accountId: draft.accountId,
      localDate: draft.localDate,
      occurredAt: draft.occurredAt,
      kind: categorization.kind ?? draft.kind,
      status: 'confirmed',
      currency: draft.currency,
      amountMinor: draft.amountMinor,
      amountUsdCents: draft.usd?.amountUsdCents ?? 0,
      fxRate: draft.usd?.fxRate ?? 1,
      fxDate: draft.usd?.fxDate ?? draft.localDate,
      categoryId: categorization.categoryId,
      tagIds: categorization.tagIds,
      categorizedBy: categorization.categoryId ? categorization.categorizedBy : 'none',
      merchantRaw: draft.merchantRaw,
      merchantKey: draft.merchantKey ?? this.d.normalizer.normalize(draft.merchantRaw),
      sources: draft.sources,
      statementRef: draft.statementRef,
      possibleDuplicateOf: null,
      reviewReason: null,
      version: 0,
      createdAt: this.d.clock.now().toISOString(),
    };
  }

  /**
   * One TransactWriteItems: the transaction items, every rollup delta, and the extra
   * conditional items (row claims). Throws VersionConflict or AlreadyClaimedError.
   */
  private async write(
    userId: string,
    changes: Array<{ old: Transaction | null; next: Transaction | null }>,
    extraItems: TransactItem[],
  ): Promise<void> {
    const [budgets, weekStart] = await Promise.all([
      this.d.reference.listBudgets(userId),
      this.weekStart(userId),
    ]);
    const txnItems: TransactItem[] = [];
    const deltas: RollupDelta[] = [];
    for (const { old, next } of changes) {
      if (!old && next) txnItems.push(this.d.transactions.putItem(next));
      else if (old && next) txnItems.push(this.d.transactions.updateItem(next, old.version));
      else if (old && !next) txnItems.push(this.d.transactions.deleteItem(old));
      deltas.push(
        ...this.d.planner.plan(
          old,
          next,
          old ? this.matches(old, budgets, weekStart) : [],
          next ? this.matches(next, budgets, weekStart) : [],
        ),
      );
    }
    const rollupItems = this.d.aggregates.addItems(userId, mergeDeltas(deltas));
    const items = [...txnItems, ...rollupItems, ...extraItems];
    if (items.length > 100) throw new ValidationError('Too many tags or budgets on one transaction.');
    try {
      await this.d.store.transactWrite(items);
    } catch (e) {
      const failed = failedConditionIndexes(e);
      if (failed && failed.length) {
        const extraStart = txnItems.length + rollupItems.length;
        if (failed.some((i) => i >= extraStart)) throw new AlreadyClaimedError();
        if (failed.some((i) => i < txnItems.length)) throw new VersionConflict();
      }
      throw e;
    }
  }

  private matches(txn: Transaction, budgets: Budget[], weekStart: WeekDay) {
    return this.d.budgetMatcher.matching(txn, budgets, weekStart);
  }

  private async weekStart(userId: string): Promise<WeekDay> {
    const s = await this.d.reference.getSettings(userId);
    return s?.weekStart ?? 'MONDAY';
  }

  private async assertCategory(userId: string, categoryId: string): Promise<void> {
    const found = await this.d.reference.getCategories(userId, [categoryId]);
    if (!found.length) throw new ValidationError('Invalid category.', { categoryId: 'Unknown category' });
  }

  private async assertTags(userId: string, tagIds: string[]): Promise<void> {
    const found = await this.d.reference.getTags(userId, tagIds);
    if (found.length !== tagIds.length) throw new ValidationError('Invalid tag.', { tagIds: 'Unknown tag' });
  }
}

/** Combine sources, keep the richest fields, and never replace a category the user set. */
export function combine(keep: Transaction, other: Transaction): Transaction {
  let categoryId = keep.categoryId;
  let categorizedBy = keep.categorizedBy;
  if (keep.categorizedBy !== 'user') {
    if (other.categorizedBy === 'user' && other.categoryId) {
      categoryId = other.categoryId;
      categorizedBy = 'user';
    } else if (!keep.categoryId && other.categoryId) {
      categoryId = other.categoryId;
      categorizedBy = other.categorizedBy;
    }
  }
  const emailSide = other.sources.includes('gmail') ? other : keep.sources.includes('gmail') ? keep : null;
  const merchantSource = emailSide ?? (other.merchantRaw.length > keep.merchantRaw.length ? other : keep);
  return {
    ...keep,
    occurredAt: keep.occurredAt ?? other.occurredAt,
    statementRef: keep.statementRef ?? other.statementRef,
    merchantRaw: merchantSource.merchantRaw,
    merchantKey: merchantSource.merchantKey,
    categoryId,
    categorizedBy,
    tagIds: [...new Set([...(keep.tagIds ?? []), ...(other.tagIds ?? [])])],
    sources: [...new Set([...keep.sources, ...other.sources])],
    possibleDuplicateOf: null,
    version: keep.version + 1,
  };
}
