import {
  flowOf,
  type Budget,
  type Currency,
  type NewTransactionInput,
  type Transaction,
  type TransactionChangesInput,
  type TransactionKind,
  type TransactionSource,
  type TransactionStatus,
  type WeekDay,
} from '@finance/shared';
import type { Clock } from '../clock';
import { AlreadyClaimedError, ConflictError, NotFoundError, ValidationError } from '../errors';
import { newDatedId } from '../keys';
import type { AggregateRepository } from '../repositories/aggregate-repository';
import { DynamoStore, TransactionCancelledError, type TransactItem } from '../repositories/dynamo-store';
import type { ReferenceRepository } from '../repositories/reference-repository';
import { reviewReasonFor, type TransactionRepository } from '../repositories/transaction-repository';
import type { BudgetMatcher } from './budget-matcher';
import type { Categorization, Categorizer } from './categorizer';
import type { FxService } from './fx-service';
import type { Normalizer } from './normalizer';
import type { RollupDelta, RollupPlanner } from './rollup-planner';

/** What every source hands to `save`: a parsed transaction with its kind resolved. */
export interface TransactionDraft {
  accountId: string;
  localDate: string;
  occurredAt?: string | null;
  kind: TransactionKind;
  currency: Currency;
  amountMinor: number;
  merchantRaw: string;
  merchantKey?: string;
  statementRef?: string | null;
  authorization?: string | null;
  source: TransactionSource;
  note?: string | null;
}

export interface SaveOptions {
  possibleDuplicateOf?: string | null;
}

/** Status of a transaction from its category: excluded flows (transfers) never wait for one. */
export function statusFor(kind: TransactionKind, categoryId: string | null): TransactionStatus {
  if (categoryId) return 'confirmed';
  return flowOf(kind) === 'excluded' ? 'confirmed' : 'pending_review';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The single save path. Converts to USD, matches budgets, and writes the
 * transaction and every rollup it affects in one `TransactWriteItems`.
 */
export class TransactionService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly aggregates: AggregateRepository,
    private readonly reference: ReferenceRepository,
    private readonly store: DynamoStore,
    private readonly fx: FxService,
    private readonly normalizer: Normalizer,
    private readonly categorizer: Categorizer,
    private readonly matcher: BudgetMatcher,
    private readonly planner: RollupPlanner,
    private readonly clock: Clock,
  ) {}

  /** Manual entry (01-S03, 01-S05): categorizes itself; a manual entry keeps the kind the user picked. */
  async create(userId: string, input: NewTransactionInput): Promise<Transaction> {
    const account = await this.reference.getAccount(userId, input.accountId);
    if (!account) throw new ValidationError('Unknown account');
    const merchantKey = this.normalizer.normalize(input.merchantRaw);
    let categorization: Categorization;
    if (input.categoryId) {
      await this.validateTaxonomy(userId, input.categoryId, input.tagIds);
      categorization = {
        categoryId: input.categoryId,
        tagIds: input.tagIds,
        categorizedBy: 'user',
        status: 'confirmed',
      };
    } else {
      if (input.tagIds.length > 0) await this.validateTaxonomy(userId, null, input.tagIds);
      const auto = await this.categorizer.categorize(userId, merchantKey);
      categorization = { ...auto, kind: null, tagIds: [...new Set([...auto.tagIds, ...input.tagIds])] };
    }
    return this.save(
      userId,
      {
        accountId: input.accountId,
        localDate: input.localDate,
        occurredAt: input.occurredAt ?? null,
        kind: input.kind,
        currency: input.currency,
        amountMinor: input.amountMinor,
        merchantRaw: input.merchantRaw,
        merchantKey,
        source: 'manual',
        note: input.note ?? null,
      },
      categorization,
      [],
    );
  }

  /**
   * Saves a new transaction from any source. `extraItems` (a CSV row claim) are
   * written in the same transaction; if one of their conditions fails, nothing
   * is written and `AlreadyClaimedError` is thrown.
   */
  async save(
    userId: string,
    parsed: TransactionDraft,
    categorization: Categorization,
    extraItems: TransactItem[] = [],
    options: SaveOptions = {},
  ): Promise<Transaction> {
    const conversion = await this.fx.toUsd(parsed.amountMinor, parsed.currency, parsed.localDate);
    const kind = categorization.kind ?? parsed.kind;
    const now = this.clock.now().toISOString();
    const txn: Transaction = {
      id: newDatedId(parsed.localDate),
      userId,
      accountId: parsed.accountId,
      localDate: parsed.localDate,
      occurredAt: parsed.occurredAt ?? null,
      kind,
      status: statusFor(kind, categorization.categoryId),
      currency: parsed.currency,
      amountMinor: parsed.amountMinor,
      amountUsdCents: conversion.amountUsdCents,
      fxRate: conversion.fxRate,
      fxDate: conversion.fxDate,
      categoryId: categorization.categoryId,
      tagIds: categorization.tagIds,
      categorizedBy: categorization.categorizedBy,
      merchantRaw: parsed.merchantRaw,
      merchantKey: parsed.merchantKey ?? this.normalizer.normalize(parsed.merchantRaw),
      sources: [parsed.source],
      statementRef: parsed.statementRef ?? null,
      authorization: parsed.authorization ?? null,
      possibleDuplicateOf: options.possibleDuplicateOf ?? null,
      note: parsed.note ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    txn.reviewReason = reviewReasonFor(txn);
    await this.write(userId, [{ old: null, new: txn }], extraItems);
    return txn;
  }

  /** Category, tag, and kind changes (02-S02, 02-S05, 02-S06). Retries once on a version conflict, then 409. */
  async update(userId: string, id: string, changes: TransactionChangesInput, actor: 'user' | 'system' = 'user'): Promise<Transaction> {
    if (changes.categoryId !== undefined || changes.tagIds !== undefined) {
      await this.validateTaxonomy(userId, changes.categoryId ?? null, changes.tagIds ?? []);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const old = await this.transactions.get(userId, id);
      if (!old) throw new NotFoundError('Transaction not found');
      if (attempt === 0 && changes.version !== undefined && changes.version !== old.version) {
        throw new ConflictError('The transaction changed meanwhile; reload it');
      }
      const next: Transaction = { ...old, tagIds: [...(old.tagIds ?? [])] };
      if (changes.categoryId !== undefined) next.categoryId = changes.categoryId ?? null;
      if (changes.tagIds !== undefined) next.tagIds = [...new Set(changes.tagIds)];
      if (changes.kind !== undefined) next.kind = changes.kind;
      if (changes.note !== undefined) next.note = changes.note ?? null;
      if (actor === 'user' && (changes.categoryId !== undefined || changes.tagIds !== undefined)) next.categorizedBy = 'user';
      next.status = statusFor(next.kind, next.categoryId);
      next.version = old.version + 1;
      next.updatedAt = this.clock.now().toISOString();
      next.reviewReason = reviewReasonFor(next);
      try {
        await this.write(userId, [{ old, new: next }], []);
        return next;
      } catch (err) {
        if (err instanceof VersionConflict && attempt === 0) continue;
        if (err instanceof VersionConflict) throw new ConflictError('The transaction changed meanwhile; reload it');
        throw err;
      }
    }
    throw new ConflictError('The transaction changed meanwhile; reload it');
  }

  /**
   * Merges `drop` into `keepId`. `drop` is either another stored transaction (the
   * review inbox, 01-S04), which is deleted and subtracted from every rollup, or an
   * incoming draft from the pipeline (an exact duplicate), which is never stored on its own.
   * A category set by the user is never replaced.
   */
  async merge(
    userId: string,
    keepId: string,
    drop: string | (TransactionDraft & { categorization?: Categorization }),
    extraItems: TransactItem[] = [],
  ): Promise<Transaction> {
    if (typeof drop === 'string' && drop === keepId) throw new ValidationError('Cannot merge a transaction into itself');
    for (let attempt = 0; attempt < 2; attempt++) {
      const keep = await this.transactions.get(userId, keepId);
      if (!keep) throw new NotFoundError('Transaction not found');
      let dropTxn: Transaction | null = null;
      let incoming: Partial<Transaction> & { sources: TransactionSource[] };
      if (typeof drop === 'string') {
        dropTxn = (await this.transactions.get(userId, drop)) ?? null;
        if (!dropTxn) throw new NotFoundError('Transaction to merge not found');
        incoming = dropTxn;
      } else {
        const cat = drop.categorization;
        incoming = {
          occurredAt: drop.occurredAt ?? null,
          merchantRaw: drop.merchantRaw,
          statementRef: drop.statementRef ?? null,
          authorization: drop.authorization ?? null,
          sources: [drop.source],
          categoryId: cat?.categoryId ?? null,
          tagIds: cat?.tagIds ?? [],
          categorizedBy: cat?.categorizedBy ?? 'none',
        };
      }
      const next = this.combine(keep, incoming);
      next.version = keep.version + 1;
      next.updatedAt = this.clock.now().toISOString();
      if (dropTxn && next.possibleDuplicateOf === dropTxn.id) next.possibleDuplicateOf = null;
      next.reviewReason = reviewReasonFor(next);
      try {
        const changes: { old: Transaction | null; new: Transaction | null }[] = [{ old: keep, new: next }];
        if (dropTxn) changes.push({ old: dropTxn, new: null });
        await this.write(userId, changes, extraItems);
        return next;
      } catch (err) {
        if (err instanceof VersionConflict && attempt === 0) continue;
        if (err instanceof VersionConflict) throw new ConflictError('A transaction changed meanwhile; reload the review inbox');
        throw err;
      }
    }
    throw new ConflictError('A transaction changed meanwhile; reload the review inbox');
  }

  /** Combine sources, keep the richest fields, keep a user-set category. */
  private combine(keep: Transaction, incoming: Partial<Transaction> & { sources: TransactionSource[] }): Transaction {
    const next: Transaction = { ...keep, tagIds: [...(keep.tagIds ?? [])] };
    next.sources = [...new Set([...(keep.sources ?? []), ...(incoming.sources ?? [])])];
    next.occurredAt = keep.occurredAt ?? incoming.occurredAt ?? null;
    next.statementRef = keep.statementRef ?? incoming.statementRef ?? null;
    next.authorization = keep.authorization ?? incoming.authorization ?? null;
    // An alert names the merchant better than a statement row does.
    if (incoming.sources.includes('gmail') && !keep.sources.includes('gmail') && incoming.merchantRaw) {
      next.merchantRaw = incoming.merchantRaw;
    }
    if (keep.categorizedBy !== 'user') {
      const incomingIsUser = incoming.categorizedBy === 'user';
      if ((!keep.categoryId && incoming.categoryId) || (incomingIsUser && incoming.categoryId)) {
        next.categoryId = incoming.categoryId!;
        next.categorizedBy = incoming.categorizedBy ?? next.categorizedBy;
      }
    }
    next.tagIds = [...new Set([...next.tagIds, ...(incoming.tagIds ?? [])])];
    next.status = statusFor(next.kind, next.categoryId);
    return next;
  }

  /** Clears `possibleDuplicateOf` on a transaction the user says is not a duplicate. */
  async dismissDuplicate(userId: string, id: string): Promise<Transaction> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const old = await this.transactions.get(userId, id);
      if (!old) throw new NotFoundError('Transaction not found');
      const next: Transaction = { ...old, possibleDuplicateOf: null, version: old.version + 1, updatedAt: this.clock.now().toISOString() };
      next.reviewReason = reviewReasonFor(next);
      try {
        await this.store.transactWrite([this.transactions.updateItem(next, old.version)]);
        return next;
      } catch (err) {
        if (err instanceof TransactionCancelledError && attempt === 0) continue;
        if (err instanceof TransactionCancelledError) throw new ConflictError('The transaction changed meanwhile');
        throw err;
      }
    }
    throw new ConflictError('The transaction changed meanwhile');
  }

  /**
   * Writes the transaction changes and every rollup delta in one
   * `TransactWriteItems`. Each change is old → new (null for create or delete).
   */
  private async write(
    userId: string,
    changes: { old: Transaction | null; new: Transaction | null }[],
    extraItems: TransactItem[],
  ): Promise<void> {
    const [budgets, settings] = await Promise.all([this.reference.listBudgets(userId), this.reference.getSettings(userId)]);
    const weekStart: WeekDay = settings.weekStart;
    const txnItems: TransactItem[] = [];
    const deltas: RollupDelta[] = [];
    for (const change of changes) {
      const oldMatches = change.old ? this.matcher.matching(change.old, budgets as Budget[], weekStart) : [];
      const newMatches = change.new ? this.matcher.matching(change.new, budgets as Budget[], weekStart) : [];
      deltas.push(...this.planner.plan(change.old, change.new, oldMatches, newMatches));
      if (change.old && change.new) txnItems.push(this.transactions.updateItem(change.new, change.old.version));
      else if (change.new) txnItems.push(this.transactions.putItem(change.new));
      else if (change.old) txnItems.push(this.transactions.deleteItem(change.old));
    }
    const rollupItems = this.aggregates.addItems(userId, this.planner.combine(deltas));
    const items = [...txnItems, ...rollupItems, ...extraItems];
    const extraStart = txnItems.length + rollupItems.length;

    for (let attempt = 0; ; attempt++) {
      try {
        await this.store.transactWrite(items);
        return;
      } catch (err) {
        if (!(err instanceof TransactionCancelledError)) throw err;
        const failed = err.conditionFailedAt();
        if (failed.some((i) => i >= extraStart)) throw new AlreadyClaimedError();
        if (failed.some((i) => i < txnItems.length)) throw new VersionConflict();
        if (err.isConflict() && attempt < 3) {
          await sleep(50 * 2 ** attempt + Math.floor(Math.random() * 50));
          continue;
        }
        throw err;
      }
    }
  }

  private async validateTaxonomy(userId: string, categoryId: string | null, tagIds: string[]): Promise<void> {
    if (categoryId) {
      const cats = (await this.reference.getCategories(userId, [categoryId])).filter((c) => !c.archived);
      if (cats.length === 0) throw new ValidationError('Invalid category');
    }
    const unique = [...new Set(tagIds)];
    if (unique.length > 0) {
      const tags = (await this.reference.getTags(userId, unique)).filter((t) => !t.archived);
      const found = new Set(tags.map((t) => t.id));
      if (unique.some((t) => !found.has(t))) throw new ValidationError('Invalid tag');
    }
  }
}

/** Internal: the `version` condition of a transaction item failed. */
class VersionConflict extends Error {}
