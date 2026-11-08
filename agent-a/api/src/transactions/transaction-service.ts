import {
  countsAsSpending,
  type Currency,
  type NewTransaction,
  type ParsedTransaction,
  type Transaction,
  type TransactionChanges,
  type TransactionSource,
  type UsdConversion,
} from "@finance/shared";
import type { BudgetMatcher } from "../budgets/budget-matcher";
import type { Categorization, Categorizer } from "../categorization/categorizer";
import { LabelValidator } from "../categorization/label-validator";
import type { Normalizer } from "../categorization/normalizer";
import type { Clock } from "../clock";
import type { FxService } from "../fx/fx-service";
import { ConflictError, NotFoundError, ValidationError } from "../http/errors";
import { datedId } from "../ids";
import type { AggregateRepository } from "../repositories/aggregate-repository";
import type { DynamoStore, TransactItem } from "../repositories/dynamo-store";
import type { ReferenceRepository } from "../repositories/reference-repository";
import type { TransactionRepository } from "../repositories/transaction-repository";
import type { RollupPlanner } from "./rollup-planner";

export type Actor = "user" | "system";

/** A parsed row or email after the pipeline has resolved its account and currency. */
export interface ResolvedParsed extends ParsedTransaction {
  accountId: string;
  currency: Currency;
}

export interface SaveOptions {
  conversion?: UsdConversion;
  possibleDuplicateOf?: string;
}

interface Change {
  old?: Transaction;
  next?: Transaction;
}

/**
 * The single save path. Manual entry, Gmail alerts, and CSV rows all end here. Every write converts
 * to USD, matches budgets, and writes the transaction and every rollup it affects in one
 * TransactWriteItems, guarded by `version`.
 */
export class TransactionService {
  private readonly labels: LabelValidator;

  constructor(
    private readonly store: DynamoStore,
    private readonly transactions: TransactionRepository,
    private readonly aggregates: AggregateRepository,
    private readonly reference: ReferenceRepository,
    private readonly fx: FxService,
    private readonly normalizer: Normalizer,
    private readonly categorizer: Categorizer,
    private readonly matcher: BudgetMatcher,
    private readonly planner: RollupPlanner,
    private readonly clock: Clock,
  ) {
    this.labels = new LabelValidator(reference);
  }

  /** Manual entry (01-S03, 01-S05). Categorizes itself unless the user picked a category. */
  async create(userId: string, input: NewTransaction): Promise<Transaction> {
    const account = await this.reference.getAccount(userId, input.accountId);
    if (!account) throw new ValidationError("unknown account", "UNKNOWN_ACCOUNT");
    const currency = input.currency ?? account.currency;
    await this.labels.validate(userId, input.categoryId, input.tagIds);
    const conversion = await this.fx.toUsd(input.amountMinor, currency, input.localDate);
    const merchantKey = input.merchantRaw ? this.normalizer.normalize(input.merchantRaw) : undefined;

    let categorization: Categorization;
    if (input.categoryId) {
      categorization = { categoryId: input.categoryId, tagIds: [], categorizedBy: "user", status: "confirmed" };
    } else {
      categorization = await this.categorizer.categorize(userId, merchantKey);
    }
    const txn = this.build(userId, {
      accountId: account.id,
      localDate: input.localDate,
      kind: input.kind,
      currency,
      amountMinor: input.amountMinor,
      merchantRaw: input.merchantRaw,
      merchantKey,
      note: input.note,
      source: "manual",
      conversion,
      categorization: { ...categorization, tagIds: union(categorization.tagIds, input.tagIds) },
    });
    await this.withRetry(async () => [{ next: txn }]);
    return txn;
  }

  /** Ingest path (CSV rows and Gmail alerts). The pipeline has already categorized the transaction. */
  async save(userId: string, parsed: ResolvedParsed, categorization: Categorization, options: SaveOptions = {}): Promise<Transaction> {
    const conversion = options.conversion ?? (await this.fx.toUsd(parsed.amountMinor, parsed.currency, parsed.localDate));
    const txn = this.build(userId, {
      accountId: parsed.accountId,
      localDate: parsed.localDate,
      occurredAt: parsed.occurredAt,
      kind: parsed.kind,
      currency: parsed.currency,
      amountMinor: parsed.amountMinor,
      merchantRaw: parsed.merchantRaw,
      merchantKey: parsed.merchantRaw ? this.normalizer.normalize(parsed.merchantRaw) : undefined,
      statementRef: parsed.statementRef,
      source: parsed.source,
      conversion,
      categorization,
      possibleDuplicateOf: options.possibleDuplicateOf,
    });
    await this.withRetry(async () => [{ next: txn }]);
    return txn;
  }

  /** Category, tag, and detail changes (02-S02, 02-S05, 02-S06). Moves the amount between rollups. */
  async update(userId: string, id: string, changes: TransactionChanges, actor: Actor): Promise<Transaction> {
    if (changes.categoryId !== undefined || changes.tagIds !== undefined) {
      await this.labels.validate(userId, changes.categoryId ?? undefined, changes.tagIds ?? []);
    }
    let result!: Transaction;
    await this.withRetry(async () => {
      const old = await this.transactions.get(userId, id);
      if (!old) throw new NotFoundError("transaction not found");
      const next: Transaction = { ...old, tagIds: [...old.tagIds], version: old.version + 1 };
      if (changes.kind !== undefined) next.kind = changes.kind;
      if (changes.merchantRaw !== undefined) {
        next.merchantRaw = changes.merchantRaw || undefined;
        next.merchantKey = changes.merchantRaw ? this.normalizer.normalize(changes.merchantRaw) : undefined;
      }
      if (changes.note !== undefined) next.note = changes.note || undefined;
      if (changes.tagIds !== undefined) next.tagIds = [...new Set(changes.tagIds)];
      if (changes.categoryId !== undefined) {
        next.categoryId = changes.categoryId ?? undefined;
        if (actor === "user") next.categorizedBy = changes.categoryId ? "user" : "none";
      }
      if (changes.amountMinor !== undefined || changes.currency !== undefined) {
        next.amountMinor = changes.amountMinor ?? old.amountMinor;
        next.currency = changes.currency ?? old.currency;
        const conversion = await this.fx.toUsd(next.amountMinor, next.currency, next.localDate);
        next.amountUsdCents = conversion.amountUsdCents;
        next.fxRate = conversion.fxRate;
        next.fxDate = conversion.fxDate;
      }
      next.status = needsCategory(next) ? "pending_review" : "confirmed";
      next.reviewReason = reviewReasonOf(next);
      result = next;
      return [{ old, next }];
    });
    return result;
  }

  /** Keeps one record of a purchase that arrived twice (01-S04): update `keepId`, delete `dropId`. */
  async merge(userId: string, keepId: string, dropId: string): Promise<Transaction> {
    let result!: Transaction;
    await this.withRetry(async () => {
      const [keep, drop] = await Promise.all([this.transactions.get(userId, keepId), this.transactions.get(userId, dropId)]);
      if (!keep || !drop) throw new NotFoundError("transaction not found");
      const next = combineFields(keep, drop);
      result = next;
      return [{ old: keep, next }, { old: drop }];
    });
    return result;
  }

  /** Merges a parsed row or email into an existing transaction it exactly matches (cross-source duplicate). */
  async mergeParsed(userId: string, existingId: string, parsed: ResolvedParsed, categorization: Categorization): Promise<Transaction> {
    let result!: Transaction;
    await this.withRetry(async () => {
      const existing = await this.transactions.get(userId, existingId);
      if (!existing) throw new NotFoundError("transaction not found");
      const incoming = this.build(userId, {
        accountId: parsed.accountId,
        localDate: existing.localDate,
        occurredAt: parsed.occurredAt,
        kind: existing.kind,
        currency: existing.currency,
        amountMinor: existing.amountMinor,
        merchantRaw: parsed.merchantRaw,
        merchantKey: parsed.merchantRaw ? this.normalizer.normalize(parsed.merchantRaw) : undefined,
        statementRef: parsed.statementRef,
        source: parsed.source,
        conversion: { amountUsdCents: existing.amountUsdCents, fxRate: existing.fxRate, fxDate: existing.fxDate },
        categorization,
      });
      const next = combineFields(existing, incoming);
      result = next;
      return [{ old: existing, next }];
    });
    return result;
  }

  /** Runs one write, re-reading and retrying once when the version condition fails, then 409. */
  private async withRetry(prepare: () => Promise<Change[]>): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const changes = await prepare();
      try {
        await this.write(changes);
        return;
      } catch (error) {
        if (error instanceof ConflictError && attempt === 0) continue;
        throw error;
      }
    }
  }

  private async write(changes: Change[]): Promise<void> {
    const userId = (changes[0].next ?? changes[0].old)!.userId;
    const [budgets, settings] = await Promise.all([this.reference.listBudgets(userId), this.reference.getSettings(userId)]);
    const items: TransactItem[] = [];
    const deltas = [];
    for (const { old, next } of changes) {
      if (old && next) items.push(this.transactions.updateItem(next, old.version));
      else if (next) items.push(this.transactions.putItem(next));
      else if (old) items.push(this.transactions.deleteItem(old));
      deltas.push(
        ...this.planner.plan(
          old,
          next,
          old ? this.matcher.matching(old, budgets, settings.weekStart) : [],
          next ? this.matcher.matching(next, budgets, settings.weekStart) : [],
        ),
      );
    }
    items.push(...this.aggregates.addItems(userId, deltas));
    if (items.length > 100) throw new ValidationError("this change touches too many tags and budgets to save at once");
    await this.store.transactWrite(items);
  }

  private build(
    userId: string,
    f: {
      accountId: string;
      localDate: string;
      occurredAt?: string;
      kind: Transaction["kind"];
      currency: Currency;
      amountMinor: number;
      merchantRaw?: string;
      merchantKey?: string;
      note?: string;
      statementRef?: string;
      source: TransactionSource;
      conversion: UsdConversion;
      categorization: Categorization;
      possibleDuplicateOf?: string;
    },
  ): Transaction {
    const txn: Transaction = {
      id: datedId(f.localDate),
      userId,
      accountId: f.accountId,
      localDate: f.localDate,
      occurredAt: f.occurredAt,
      kind: f.kind,
      status: "confirmed",
      currency: f.currency,
      amountMinor: f.amountMinor,
      amountUsdCents: f.conversion.amountUsdCents,
      fxRate: f.conversion.fxRate,
      fxDate: f.conversion.fxDate,
      categoryId: f.categorization.categoryId,
      tagIds: [...new Set(f.categorization.tagIds)],
      categorizedBy: f.categorization.categorizedBy,
      merchantRaw: f.merchantRaw,
      merchantKey: f.merchantKey,
      note: f.note,
      sources: [f.source],
      statementRef: f.statementRef,
      possibleDuplicateOf: f.possibleDuplicateOf,
      createdAt: this.clock.now().toISOString(),
      version: 1,
    };
    txn.status = needsCategory(txn) ? "pending_review" : "confirmed";
    txn.reviewReason = reviewReasonOf(txn);
    return txn;
  }
}

/** Spending without a category waits in the review inbox. Income, transfers, and card payments do not need one. */
function needsCategory(txn: Pick<Transaction, "kind" | "categoryId">): boolean {
  return countsAsSpending(txn.kind) && !txn.categoryId;
}

export function reviewReasonOf(txn: Pick<Transaction, "possibleDuplicateOf" | "status">): Transaction["reviewReason"] {
  if (txn.possibleDuplicateOf) return "DUPLICATE";
  if (txn.status === "pending_review") return "UNCATEGORIZED";
  return undefined;
}

/**
 * Combines two records of one purchase: sources are united, the richer value of each field is
 * kept, and a category the user set is never replaced.
 */
export function combineFields(keep: Transaction, other: Transaction): Transaction {
  const next: Transaction = { ...keep, tagIds: [...keep.tagIds], version: keep.version + 1 };
  next.sources = [...new Set([...keep.sources, ...other.sources])];
  next.occurredAt = keep.occurredAt ?? other.occurredAt;
  next.statementRef = keep.statementRef ?? other.statementRef;
  next.note = keep.note ?? other.note;
  if (!keep.merchantRaw || (other.merchantRaw && other.merchantRaw.length > keep.merchantRaw.length && keep.categorizedBy !== "user")) {
    next.merchantRaw = other.merchantRaw ?? keep.merchantRaw;
    next.merchantKey = other.merchantKey ?? keep.merchantKey;
  }
  const keepUserSet = keep.categorizedBy === "user";
  const otherUserSet = other.categorizedBy === "user";
  if (!keepUserSet && (otherUserSet || (!keep.categoryId && other.categoryId))) {
    next.categoryId = other.categoryId;
    next.categorizedBy = other.categorizedBy;
    next.tagIds = union(keep.tagIds, other.tagIds);
  } else {
    next.tagIds = keepUserSet ? keep.tagIds : union(keep.tagIds, other.tagIds);
  }
  next.possibleDuplicateOf = undefined;
  next.status = needsCategory(next) ? "pending_review" : "confirmed";
  next.reviewReason = reviewReasonOf(next);
  return next;
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}
