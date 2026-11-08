import type { InvestmentTransaction } from "@finance/shared";
import { ConflictError } from "../http/errors";
import { dateFromDatedId } from "../ids";
import { Keys } from "../keys";
import { DynamoStore, isConditionFailure, stripKeys, type Item, type TransactItem } from "./dynamo-store";

export const TICKER_INDEX = "ticker";

/** InvestmentTx table: `SK = INV#<date>#<id>`, GSI `ticker` on `tickerPK = USER#id#<ticker>`. */
export class InvestmentTxRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  async get(userId: string, id: string): Promise<InvestmentTransaction | undefined> {
    const date = dateFromDatedId(id);
    if (!date) return undefined;
    const item = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.inv(date, id) });
    return item ? stripKeys<InvestmentTransaction>(item) : undefined;
  }

  /** Every buy and sell of a ticker, in date order. */
  async listByTicker(userId: string, ticker: string): Promise<InvestmentTransaction[]> {
    const items = await this.store.query(
      this.table,
      { pkName: "tickerPK", pk: Keys.tickerPK(userId, ticker), skName: "SK", beginsWith: "INV#" },
      { index: TICKER_INDEX, forward: true },
    );
    return items.map((i) => stripKeys<InvestmentTransaction>(i));
  }

  /** Every investment transaction of a user, newest first (supporting the portfolio screen's correction list). */
  async listAll(userId: string): Promise<InvestmentTransaction[]> {
    const items = await this.store.query(this.table, { pk: Keys.user(userId), beginsWith: "INV#" }, { forward: false });
    return items.map((i) => stripKeys<InvestmentTransaction>(i));
  }

  putItem(tx: InvestmentTransaction): TransactItem {
    return { Put: { TableName: this.table, Item: toItem(tx), ConditionExpression: "attribute_not_exists(PK)" } };
  }

  updateItem(tx: InvestmentTransaction, expectedVersion: number): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: toItem(tx),
        ConditionExpression: "#v = :expected",
        ExpressionAttributeNames: { "#v": "version" },
        ExpressionAttributeValues: { ":expected": expectedVersion },
      },
    };
  }

  async update(tx: InvestmentTransaction, expectedVersion: number): Promise<void> {
    try {
      await this.store.put(this.table, toItem(tx), {
        expression: "#v = :expected",
        names: { "#v": "version" },
        values: { ":expected": expectedVersion },
      });
    } catch (error) {
      if (isConditionFailure(error)) throw new ConflictError();
      throw error;
    }
  }
}

function toItem(tx: InvestmentTransaction): Item {
  const item: Item = { ...tx, PK: Keys.user(tx.userId), SK: Keys.inv(tx.localDate, tx.id) };
  if (tx.ticker) item.tickerPK = Keys.tickerPK(tx.userId, tx.ticker);
  for (const [k, v] of Object.entries(item)) if (v === undefined) delete item[k];
  return item;
}
