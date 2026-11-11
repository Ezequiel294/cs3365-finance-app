import type { ReviewReason, Transaction } from '@finance/shared';
import { dateFromDatedId, Keys } from '../keys';
import { DynamoStore, strip, type Item, type TransactItem } from './dynamo-store';

export const REVIEW_INDEX = 'review';

/** Which review list a transaction belongs to, if any. Duplicates take priority. */
export function reviewReasonFor(txn: Transaction): ReviewReason | null {
  if (txn.possibleDuplicateOf) return 'DUPLICATE';
  if (txn.status === 'pending_review') return 'UNCATEGORIZED';
  return null;
}

export class TransactionRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  private toItem(txn: Transaction): Item {
    const reason = reviewReasonFor(txn);
    const item: Item = {
      PK: Keys.user(txn.userId),
      SK: Keys.txn(txn.localDate, txn.id),
      ...txn,
      reviewReason: reason,
    };
    // The review GSI is sparse: the attributes exist only while a decision is needed.
    if (reason) {
      item.reviewPK = Keys.user(txn.userId);
      item.reviewSK = `${reason}#${txn.localDate}#${txn.id}`;
    }
    return item;
  }

  async get(userId: string, id: string): Promise<Transaction | undefined> {
    const date = dateFromDatedId(id);
    if (!date) return undefined;
    const item = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.txn(date, id) }, true);
    return strip<Transaction>(item);
  }

  async listByDate(userId: string, from: string, to: string): Promise<Transaction[]> {
    const items = await this.store.queryAll(this.table, 'PK = :pk AND SK BETWEEN :from AND :to', {
      values: { ':pk': Keys.user(userId), ':from': `TXN#${from}`, ':to': `TXN#${to}~` },
    });
    return items.map((i) => strip<Transaction>(i)!);
  }

  async findNear(userId: string, accountId: string, from: string, to: string): Promise<Transaction[]> {
    const items = await this.store.queryAll(this.table, 'PK = :pk AND SK BETWEEN :from AND :to', {
      values: { ':pk': Keys.user(userId), ':from': `TXN#${from}`, ':to': `TXN#${to}~`, ':acc': accountId },
      filter: 'accountId = :acc',
      consistent: true,
    });
    return items.map((i) => strip<Transaction>(i)!);
  }

  async listReview(userId: string, reason?: ReviewReason): Promise<Transaction[]> {
    const values: Record<string, unknown> = { ':pk': Keys.user(userId) };
    let condition = 'reviewPK = :pk';
    if (reason) {
      condition += ' AND begins_with(reviewSK, :reason)';
      values[':reason'] = `${reason}#`;
    }
    const items = await this.store.queryAll(this.table, condition, { indexName: REVIEW_INDEX, values });
    return items.map((i) => strip<Transaction>(i)!);
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

  /** Replaces the whole item (so a cleared review flag removes the GSI keys), guarded by `version`. */
  updateItem(txn: Transaction, expectedVersion: number): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: this.toItem(txn),
        ConditionExpression: 'attribute_exists(PK) AND #v = :expected',
        ExpressionAttributeNames: { '#v': 'version' },
        ExpressionAttributeValues: { ':expected': expectedVersion },
      },
    };
  }

  deleteItem(txn: Transaction): TransactItem {
    return {
      Delete: {
        TableName: this.table,
        Key: { PK: Keys.user(txn.userId), SK: Keys.txn(txn.localDate, txn.id) },
        ConditionExpression: '#v = :expected',
        ExpressionAttributeNames: { '#v': 'version' },
        ExpressionAttributeValues: { ':expected': txn.version },
      },
    };
  }
}
