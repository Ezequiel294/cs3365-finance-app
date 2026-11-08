import type { ReviewReason, Transaction } from "@finance/shared";
import { dateFromDatedId } from "../ids";
import { Keys } from "../keys";
import { DynamoStore, stripKeys, type Item, type TransactItem } from "./dynamo-store";

export const REVIEW_INDEX = "review";

/** Transactions table: `PK = USER#id`, `SK = TXN#<date>#<id>`, sparse GSI `review`. */
export class TransactionRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  async get(userId: string, id: string): Promise<Transaction | undefined> {
    const date = dateFromDatedId(id);
    if (!date) return undefined;
    const item = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.txn(date, id) });
    return item ? toTransaction(item) : undefined;
  }

  async listByDate(userId: string, from: string, to: string): Promise<Transaction[]> {
    const items = await this.store.query(this.table, {
      pk: Keys.user(userId),
      between: [Keys.txnRangeStart(from), Keys.txnRangeEnd(to)],
    });
    return items.map(toTransaction);
  }

  async findNear(userId: string, accountId: string, from: string, to: string): Promise<Transaction[]> {
    const items = await this.store.query(
      this.table,
      { pk: Keys.user(userId), between: [Keys.txnRangeStart(from), Keys.txnRangeEnd(to)] },
      { filter: { expression: "#acc = :acc", names: { "#acc": "accountId" }, values: { ":acc": accountId } } },
    );
    return items.map(toTransaction);
  }

  async listReview(userId: string, reason?: ReviewReason): Promise<Transaction[]> {
    const items = await this.store.query(
      this.table,
      { pkName: "reviewPK", pk: Keys.user(userId), skName: "reviewSK", beginsWith: reason ? `${reason}#` : undefined },
      { index: REVIEW_INDEX },
    );
    return items.map(toTransaction);
  }

  putItem(txn: Transaction): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: toItem(txn),
        ConditionExpression: "attribute_not_exists(PK)",
      },
    };
  }

  /** Replaces the item; the write only happens if the stored version is still `expectedVersion`. */
  updateItem(txn: Transaction, expectedVersion: number): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: toItem(txn),
        ConditionExpression: "#v = :expected",
        ExpressionAttributeNames: { "#v": "version" },
        ExpressionAttributeValues: { ":expected": expectedVersion },
      },
    };
  }

  deleteItem(txn: Transaction): TransactItem {
    return {
      Delete: {
        TableName: this.table,
        Key: { PK: Keys.user(txn.userId), SK: Keys.txn(txn.localDate, txn.id) },
        ConditionExpression: "#v = :expected",
        ExpressionAttributeNames: { "#v": "version" },
        ExpressionAttributeValues: { ":expected": txn.version },
      },
    };
  }
}

function toItem(txn: Transaction): Item {
  const item: Item = { ...txn, PK: Keys.user(txn.userId), SK: Keys.txn(txn.localDate, txn.id) };
  if (txn.reviewReason) {
    item.reviewPK = Keys.user(txn.userId);
    item.reviewSK = Keys.reviewSK(txn.reviewReason, txn.localDate, txn.id);
  }
  for (const [k, v] of Object.entries(item)) if (v === undefined) delete item[k];
  return item;
}

function toTransaction(item: Item): Transaction {
  const txn = stripKeys<Transaction>(item);
  txn.tagIds = txn.tagIds ?? [];
  txn.sources = txn.sources ?? [];
  return txn;
}
