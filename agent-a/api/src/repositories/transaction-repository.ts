import type { ReviewReason, Transaction } from '../../../shared/types';
import { Keys, dateFromId } from '../keys';
import { DynamoStore, type Item, type TransactItem, stripKeys } from './dynamo-store';

export const REVIEW_INDEX = 'review';

/** Transactions table: TXN#<date>#<id>, with the sparse `review` GSI (reviewPK). */
export class TransactionRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  private toItem(txn: Transaction): Item {
    const item: Item = {
      PK: Keys.user(txn.userId),
      SK: Keys.txn(txn.localDate, txn.id),
      ...txn,
    };
    if (txn.reviewReason) {
      item.reviewPK = Keys.user(txn.userId);
      item.reviewSK = `${txn.localDate}#${txn.id}`;
    }
    return item;
  }

  private fromItem(item: Item | null): Transaction | null {
    const t = stripKeys<Transaction>(item);
    if (!t) return null;
    return {
      ...t,
      tagIds: t.tagIds ?? [],
      sources: t.sources ?? [],
      categoryId: t.categoryId ?? null,
      statementRef: t.statementRef ?? null,
      possibleDuplicateOf: t.possibleDuplicateOf ?? null,
      reviewReason: t.reviewReason ?? null,
      occurredAt: t.occurredAt ?? null,
    };
  }

  async get(userId: string, id: string): Promise<Transaction | null> {
    const date = dateFromId(id);
    if (!date) return null;
    const item = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.txn(date, id) }, true);
    return this.fromItem(item);
  }

  async listByDate(userId: string, from: string, to: string): Promise<Transaction[]> {
    const items = await this.store.query(this.table, {
      expression: 'PK = :pk AND SK BETWEEN :from AND :to',
      values: { ':pk': Keys.user(userId), ':from': `TXN#${from}`, ':to': `TXN#${to}~` },
    });
    return items.map((i) => this.fromItem(i)!);
  }

  async findNear(userId: string, accountId: string, from: string, to: string): Promise<Transaction[]> {
    const items = await this.store.query(
      this.table,
      {
        expression: 'PK = :pk AND SK BETWEEN :from AND :to',
        values: { ':pk': Keys.user(userId), ':from': `TXN#${from}`, ':to': `TXN#${to}~` },
      },
      { filter: 'accountId = :acc', values: { ':acc': accountId } },
    );
    return items.map((i) => this.fromItem(i)!);
  }

  async listReview(userId: string, reason?: ReviewReason): Promise<Transaction[]> {
    const items = await this.store.query(
      this.table,
      { expression: 'reviewPK = :pk', values: { ':pk': Keys.user(userId) } },
      reason
        ? { indexName: REVIEW_INDEX, filter: 'reviewReason = :r', values: { ':r': reason } }
        : { indexName: REVIEW_INDEX },
    );
    return items.map((i) => this.fromItem(i)!);
  }

  /** True when at least one transaction is on the account. */
  async accountHasTransactions(userId: string, accountId: string): Promise<boolean> {
    const items = await this.store.query(
      this.table,
      { expression: 'PK = :pk AND begins_with(SK, :p)', values: { ':pk': Keys.user(userId), ':p': 'TXN#' } },
      { filter: 'accountId = :acc', values: { ':acc': accountId }, limit: 1 },
    );
    return items.length > 0;
  }

  putItem(txn: Transaction): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: this.toItem(txn),
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    };
  }

  /** Replace the item, guarded by the version that was read. */
  updateItem(txn: Transaction, expectedVersion: number): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: this.toItem(txn),
        ConditionExpression: '#v = :v',
        ExpressionAttributeNames: { '#v': 'version' },
        ExpressionAttributeValues: { ':v': expectedVersion },
      },
    };
  }

  deleteItem(txn: Transaction): TransactItem {
    return {
      Delete: {
        TableName: this.table,
        Key: { PK: Keys.user(txn.userId), SK: Keys.txn(txn.localDate, txn.id) },
        ConditionExpression: '#v = :v',
        ExpressionAttributeNames: { '#v': 'version' },
        ExpressionAttributeValues: { ':v': txn.version },
      },
    };
  }
}
